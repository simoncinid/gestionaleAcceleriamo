import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call, createUser } from "./helpers";
import type { Oggi } from "../worker/today/tipi";

const GIORNO = 86_400_000;
const NOW = Date.UTC(2026, 9, 13, 10, 0); // martedì 13 ottobre, 12:00 a Roma

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, next_action: "Richiamare", next_action_at: NOW + 10 * GIORNO, created_at: NOW - GIORNO, updated_at: NOW, owner_id: "tommaso", ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const oggi = async (cookie: string, chi = "tutte") => (await (await call(`/api/today?chi=${chi}&now=${NOW}`, {}, cookie)).json()) as Oggi;

// Contratto blocco 1, sezione 5: una lista sola, scaduti più oggi, un lead una volta; "mie" solo i propri.
describe("GET /today", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/today")).status).toBe(401);
  });

  it("righe: aperti scaduti o di oggi, dal più vecchio; niente futuri, chiusi, cestinati", async () => {
    const cookie = await authed();
    await insertLead("scaduto", { next_action_at: NOW - 3 * GIORNO });
    await insertLead("stamattina", { next_action_at: NOW - 3_600_000 });
    await insertLead("stasera", { next_action_at: NOW + 5 * 3_600_000 });
    await insertLead("domani", { next_action_at: NOW + GIORNO });
    await insertLead("chiuso", { stage_id: "chiuso", next_action_at: NOW - GIORNO });
    await insertLead("cestino", { next_action_at: NOW - GIORNO, deleted_at: NOW });
    await insertLead("con-call", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'con-call', 'conoscenza', ?, ?, ?)").bind(NOW + 3_600_000, NOW, NOW).run();

    const o = await oggi(cookie);
    const ids = o.righe.map((l) => l.id);
    expect(ids[0]).toBe("scaduto");
    expect(ids).toContain("stamattina");
    expect(ids).toContain("stasera");
    for (const x of ["domani", "chiuso", "cestino"]) expect(ids).not.toContain(x);
    expect(new Set(ids).size).toBe(ids.length);
    expect(o.righe.every((l) => l.prossima.stato === "scaduto" || l.prossima.stato === "oggi")).toBe(true);
    const scadenze = o.righe.map((l) => l.prossima.scadenza!);
    expect(scadenze).toEqual([...scadenze].sort((x, y) => x - y));
    expect(o.totale).toBe(o.righe.length);
    expect(o.call.map((k) => k.id)).toEqual(["k1"]);
  });

  it("Miei: solo i lead con me responsabile; i non assegnati stanno in Tutti", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await insertLead("mio", { next_action_at: NOW - 1000 });
    await insertLead("libero", { next_action_at: NOW - 2000, owner_id: null });
    await insertLead("suo", { next_action_at: NOW - 3000, owner_id: "diego" });
    expect((await oggi(cookie, "mie")).righe.map((l) => l.id)).toEqual(["mio"]);
    expect((await oggi(cookie, "tutte")).righe.map((l) => l.id).sort()).toEqual(["libero", "mio", "suo"]);
  });

  it("stesso numero della tabella: GET /api/leads filtrato su scaduti più oggi dello stesso responsabile", async () => {
    const cookie = await authed();
    const adesso = Date.now();
    await insertLead("a", { next_action_at: adesso - 2 * GIORNO });
    await insertLead("b", { next_action_at: adesso + 60_000 });
    await insertLead("c", { next_action_at: adesso + 3 * GIORNO });
    await insertLead("d", { next_action_at: adesso - GIORNO, owner_id: null });
    const o = (await (await call("/api/today?chi=mie", {}, cookie)).json()) as Oggi;
    const { leads } = (await (await call("/api/leads", {}, cookie)).json()) as { leads: { id: string; ownerId: string | null; prossima?: { stato: string | null } }[] };
    const tabella = leads.filter((l) => l.ownerId === "tommaso" && (l.prossima?.stato === "scaduto" || l.prossima?.stato === "oggi"));
    expect(o.righe.map((l) => l.id).sort()).toEqual(tabella.map((l) => l.id).sort());
    expect(o.totale).toBe(tabella.length);
  });

  it("il giorno finisce a mezzanotte di Roma anche quando dura 25 ore (cambio d'ora)", async () => {
    const cookie = await authed();
    const domenica = Date.UTC(2026, 9, 25, 9, 0); // 25 ottobre, torna l'ora solare: 10:00 a Roma
    await insertLead("tardi", { next_action_at: Date.UTC(2026, 9, 25, 22, 30) }); // 23:30 a Roma, stesso giorno
    await insertLead("lunedi", { next_action_at: Date.UTC(2026, 9, 25, 23, 30) }); // 00:30 di lunedì a Roma
    const o = (await (await call(`/api/today?chi=tutte&now=${domenica}`, {}, cookie)).json()) as Oggi;
    expect(o.righe.map((l) => l.id)).toEqual(["tardi"]);
  });
});

// /stats resta quella della 1A: il test è lo stesso.
describe("numeri", () => {
  it("conta per fonte, campagna e fase, e misura la prima risposta", async () => {
    const cookie = await authed();
    await insertLead("m1", { source: "meta", meta_campaign: "Campagna A", stage_id: "chiuso", next_action: null, next_action_at: null, created_at: NOW });
    await insertLead("m2", { source: "meta", meta_campaign: "Campagna A", created_at: NOW });
    await insertLead("m3", { source: "meta", meta_campaign: "Campagna B", stage_id: "fake", next_action: null, next_action_at: null, created_at: NOW });
    await insertLead("x1", { created_at: NOW });
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a1', 'm1', 'chiamata', '', 'tommaso', ?), ('a2', 'm2', 'nota', '', 'tommaso', ?)")
      .bind(NOW + 3600_000, NOW + 7200_000)
      .run();
    const s = (await (await call(`/api/stats?from=${NOW - 1}&until=${NOW + 1}`, {}, cookie)).json()) as {
      bySource: { source: string; total: number; won: number; lost: number }[];
      byCampaign: { campaign: string; total: number; won: number }[];
      byStage: { stageId: string; count: number }[];
      firstResponse: { avgMs: number; count: number };
    };
    expect(s.bySource).toContainEqual({ source: "meta", total: 3, won: 1, lost: 1 });
    expect(s.byCampaign).toContainEqual({ campaign: "Campagna A", total: 2, won: 1, lost: 0 });
    expect(s.byStage.find((x) => x.stageId === "chiuso")?.count).toBe(1);
    expect(s.byStage).toHaveLength(9);
    expect(s.firstResponse).toEqual({ avgMs: 5_400_000, count: 2 });
  });
});
