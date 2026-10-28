import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../worker/db/client";
import { togliScaduti } from "../worker/leads/cestino";
import { authed, call } from "./helpers";

// Blocco 1, modifica 9: cestino. Ripristina nella stessa fase con lo storico, "Elimina per sempre" a mano,
// e dopo 30 giorni il giro programmato toglie per sempre i lead cestinati.
const GIORNO = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 9);
const righe = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Record<string, unknown>>().then((r) => r.results);
const conta = async (tabella: string, dove = "1=1", ...b: unknown[]) => Number((await righe(`SELECT COUNT(*) AS n FROM ${tabella} WHERE ${dove}`, ...b))[0].n);

async function lead(id: string, opz: { cestinatoIl?: number; daPersona?: boolean; stageId?: string } = {}) {
  await env.DB.prepare(`INSERT INTO leads (id, company, phone, phone_norm, source, stage_id, stage_changed_at, next_action, next_action_at, created_at, updated_at, deleted_at)
    VALUES (?1, ?2, '+39 333 000 0000', '3330000000', 'meta', ?3, 0, 'Richiamare', 0, 0, 0, ?4)`)
    .bind(id, `Azienda ${id}`, opz.stageId ?? "da-richiamare", opz.cestinatoIl ?? null).run();
  await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, created_at) VALUES (?1, ?2, 'nota', 'Nota di prova', 1)").bind(`a-${id}`, id).run();
  if (opz.cestinatoIl != null && opz.daPersona !== false) {
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, created_at) VALUES (?1, ?2, 'cestino', 'Spostato nel cestino', ?3)").bind(`c-${id}`, id, opz.cestinatoIl).run();
  }
}

describe("elimina per sempre", () => {
  it("un lead fuori dal cestino non si elimina: 409, resta tutto", async () => {
    const cookie = await authed();
    await lead("vivo");
    const r = await call("/api/leads/vivo/per-sempre", { method: "DELETE" }, cookie);
    expect(r.status).toBe(409);
    expect(await conta("leads")).toBe(1);
  });

  it("lead che non esiste: 404", async () => {
    const cookie = await authed();
    expect((await call("/api/leads/nessuno/per-sempre", { method: "DELETE" }, cookie)).status).toBe(404);
  });

  it("lead nel cestino: spariscono lead, storico, documenti e call; la proposta resta senza lead; nel registro", async () => {
    const cookie = await authed();
    await lead("via", { cestinatoIl: NOW - GIORNO });
    await lead("dop");
    await env.DB.prepare("UPDATE leads SET duplicate_of_id = 'via' WHERE id = 'dop'").run();
    await env.DB.prepare("INSERT INTO documents (id, lead_id, name, url, created_at) VALUES ('d1', 'via', 'Preventivo', 'https://esempio.invalid/p', 1)").run();
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'via', 'conoscenza', 1, 1, 1)").run();
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, company, status, registered_via, created_at, updated_at) VALUES ('p1', 'via', 'P-1', 'Azienda via', 'inviata', 'manuale', 1, 1)").run();
    const r = await call("/api/leads/via/per-sempre", { method: "DELETE" }, cookie);
    expect(r.status).toBe(200);
    expect(await conta("leads", "id = 'via'")).toBe(0);
    expect(await conta("activities", "lead_id = 'via'")).toBe(0);
    expect(await conta("documents", "lead_id = 'via'")).toBe(0);
    expect(await conta("calls", "lead_id = 'via'")).toBe(0);
    expect(await righe("SELECT lead_id FROM proposals WHERE id = 'p1'")).toEqual([{ lead_id: null }]);
    expect(await righe("SELECT duplicate_of_id FROM leads WHERE id = 'dop'")).toEqual([{ duplicate_of_id: null }]);
    expect(await righe("SELECT action FROM audit_log WHERE entity = 'lead' AND entity_id = 'via'")).toEqual([{ action: "elimina per sempre: Azienda via" }]);
    const cestino = (await (await call("/api/leads/trash", {}, cookie)).json()) as { leads: unknown[] };
    expect(cestino.leads).toHaveLength(0);
  });

  it("un lead che è diventato cliente non si elimina per sempre: 409", async () => {
    const cookie = await authed();
    await lead("cli", { cestinatoIl: NOW - GIORNO, stageId: "chiuso" });
    await env.DB.prepare("INSERT INTO clients (id, name, origin_lead_id, created_at) VALUES ('c1', 'Cliente', 'cli', 1)").run();
    const r = await call("/api/leads/cli/per-sempre", { method: "DELETE" }, cookie);
    expect(r.status).toBe(409);
    expect(await conta("leads", "id = 'cli'")).toBe(1);
  });
});

describe("cestino: elenco, ripristino, giro dei 30 giorni", () => {
  it("l'elenco dà i giorni che restano e il ripristino rimette fase e storico", async () => {
    const cookie = await authed();
    await call("/api/leads", { method: "POST", json: { company: "Da ripristinare", phone: "333 123 4567" } }, cookie);
    const [{ id }] = await righe("SELECT id FROM leads");
    await call(`/api/leads/${id}`, { method: "DELETE" }, cookie);
    const elenco = (await (await call("/api/leads/trash", {}, cookie)).json()) as { leads: { id: string; giorniRimasti: number }[] };
    expect(elenco.leads).toEqual([expect.objectContaining({ id, giorniRimasti: 30 })]);
    expect((await call(`/api/leads/${id}/restore`, { method: "POST" }, cookie)).status).toBe(200);
    const [l] = await righe("SELECT stage_id, deleted_at FROM leads WHERE id = ?", id);
    expect(l).toEqual({ stage_id: "da-chiamare-prima-volta", deleted_at: null });
    const storico = (await righe("SELECT type FROM activities WHERE lead_id = ? ORDER BY created_at", id)).map((a) => a.type);
    expect(storico).toEqual(expect.arrayContaining(["creazione", "cestino", "ripristino"]));
  });

  it("togliScaduti: via i cestinati da più di 30 giorni, restano i recenti e quelli non cestinati da una persona", async () => {
    await lead("vecchio", { cestinatoIl: NOW - 31 * GIORNO });
    await lead("recente", { cestinatoIl: NOW - 5 * GIORNO });
    await lead("assorbito", { cestinatoIl: NOW - 40 * GIORNO, daPersona: false });
    expect(await togliScaduti(getDb(env.DB), NOW)).toBe(1);
    expect((await righe("SELECT id FROM leads ORDER BY id")).map((r) => r.id)).toEqual(["assorbito", "recente"]);
    expect(await conta("activities", "lead_id = 'vecchio'")).toBe(0);
  });

  it("il riepilogo dei dati conta solo i lead del cestino", async () => {
    const cookie = await authed();
    await lead("nel-cestino", { cestinatoIl: NOW });
    await lead("unito", { cestinatoIl: NOW, daPersona: false });
    const d = (await (await call("/api/dati/riepilogo", {}, cookie)).json()) as { cestino: number };
    expect(d.cestino).toBe(1);
  });
});
