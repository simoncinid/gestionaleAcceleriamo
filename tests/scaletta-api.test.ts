import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call, createUser } from "./helpers";

const NOW = Date.now();
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: `Officina ${id}`, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const elenco = async (cookie: string, q: string) => ((await (await call(`/api/leads?${q}`, {}, cookie)).json()) as { leads: { id: string }[] }).leads.map((l) => l.id).sort();
const conta = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe("filtri della Scaletta", () => {
  it("viste fisse, punteggio, fonte Foglio Andrea e date", async () => {
    const cookie = await authed();
    await insertLead("nuovo", { stage_id: "da-chiamare-prima-volta", score: "verde", source: "foglio_andrea" });
    await insertLead("richiamo", { stage_id: "non-chiamato", score: "grigio" });
    await insertLead("attesa", { stage_id: "in-attesa-decisione" });
    await insertLead("pausa", { stage_id: "probabilmente-bloccato" });
    await insertLead("perso", { stage_id: "fake", lost_reason: "fake" });
    await insertLead("vecchio", { created_at: NOW - 40 * 86_400_000 });
    expect(await elenco(cookie, "vista=nuovi")).toEqual(["nuovo"]);
    expect(await elenco(cookie, "vista=da-richiamare")).toEqual(["richiamo", "vecchio"]);
    expect(await elenco(cookie, "vista=in-attesa")).toEqual(["attesa"]);
    expect(await elenco(cookie, "vista=in-pausa")).toEqual(["pausa"]);
    expect(await elenco(cookie, "vista=scartati")).toEqual(["perso"]);
    expect(await elenco(cookie, "score=verde")).toEqual(["nuovo"]);
    expect(await elenco(cookie, "source=foglio_andrea")).toEqual(["nuovo"]);
    expect(await elenco(cookie, `da=${NOW - 86_400_000}`)).not.toContain("vecchio");
    expect(await elenco(cookie, `a=${NOW - 30 * 86_400_000}`)).toEqual(["vecchio"]);
  });

  it("valori non validi dei filtri nuovi vengono ignorati", async () => {
    const cookie = await authed();
    await insertLead("uno");
    expect(await elenco(cookie, "vista=toString&score=rosso&da=ieri")).toEqual(["uno"]);
  });
});

describe("azioni multiple", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/leads/bulk", { method: "POST", json: { ids: ["x"], azione: "cestino" } })).status).toBe(401);
  });

  it("cambia responsabile, sposta in fase, mette nel cestino", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await insertLead("a");
    await insertLead("b");
    const bulk = (json: unknown) => call("/api/leads/bulk", { method: "POST", json }, cookie);
    expect(await (await bulk({ ids: ["a", "b"], azione: "responsabile", valore: "diego" })).json()).toEqual({ fatti: 2 });
    expect(await conta("SELECT count(*) n FROM leads WHERE owner_id = 'diego'")).toBe(2);
    expect((await bulk({ ids: ["a"], azione: "fase", valore: "da-richiamare" })).status).toBe(200);
    const chiuso = await bulk({ ids: ["a"], azione: "fase", valore: "chiuso" });
    expect(chiuso.status).toBe(422);
    expect(await chiuso.json()).toEqual({ error: "Questa fase va scelta lead per lead" });
    expect((await bulk({ ids: ["a"], azione: "fase", valore: "fake" })).status).toBe(422);
    await bulk({ ids: ["a", "b"], azione: "cestino" });
    expect(await conta("SELECT count(*) n FROM leads WHERE deleted_at IS NOT NULL")).toBe(2);
  });

  it("rifiuta più di 15 lead", async () => {
    const cookie = await authed();
    const r = await call("/api/leads/bulk", { method: "POST", json: { ids: Array.from({ length: 16 }, (_, i) => `l${i}`), azione: "cestino" } }, cookie);
    expect(r.status).toBe(400);
    const vuoto = await call("/api/leads/bulk", { method: "POST", json: { ids: [], azione: "cestino" } }, cookie);
    expect(vuoto.status).toBe(400);
  });

  it("le fasi perse con motivo vanno scelte lead per lead", async () => {
    const cookie = await authed();
    await insertLead("a");
    for (const fase of ["non-chiuso", "fuori-target", "fake", "chiuso"]) {
      const r = await call("/api/leads/bulk", { method: "POST", json: { ids: ["a"], azione: "fase", valore: fase } }, cookie);
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ error: "Questa fase va scelta lead per lead" });
    }
    const inesistente = await call("/api/leads/bulk", { method: "POST", json: { ids: ["a"], azione: "fase", valore: "boh" } }, cookie);
    expect(inesistente.status).toBe(422);
    expect(await conta("SELECT count(*) n FROM leads WHERE stage_id = 'da-richiamare'")).toBe(1);
  });

  it("i lead nel cestino e gli id sconosciuti si saltano e non contano", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await insertLead("vivo");
    await insertLead("cestinato", { deleted_at: NOW });
    const r = await call("/api/leads/bulk", { method: "POST", json: { ids: ["vivo", "cestinato", "mai-visto"], azione: "responsabile", valore: "diego" } }, cookie);
    expect(await r.json()).toEqual({ fatti: 1 });
    expect(await conta("SELECT count(*) n FROM leads WHERE id = 'cestinato' AND owner_id IS NULL")).toBe(1);
    const c = await call("/api/leads/bulk", { method: "POST", json: { ids: ["vivo", "cestinato"], azione: "cestino" } }, cookie);
    expect(await c.json()).toEqual({ fatti: 1 });
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'cestinato'")).toBe(0);
  });

  it("una voce di audit per lead, attività di cambio fase, prossima azione proposta per chi non ce l'ha", async () => {
    const cookie = await authed();
    await insertLead("perso", { stage_id: "non-chiuso", lost_reason: "prezzo", stage_changed_at: NOW - 1000 });
    await insertLead("aperto", { stage_id: "da-richiamare", next_action: "Richiamare", next_action_at: NOW + 3_600_000 });
    const r = await call("/api/leads/bulk", { method: "POST", json: { ids: ["perso", "aperto"], azione: "fase", valore: "in-attesa-decisione" } }, cookie);
    expect(await r.json()).toEqual({ fatti: 2 });
    expect(await conta("SELECT count(*) n FROM audit_log WHERE entity = 'lead' AND action = 'update' AND entity_id IN ('perso', 'aperto')")).toBe(2);
    expect(await conta("SELECT count(*) n FROM activities WHERE type = 'cambio_fase' AND lead_id IN ('perso', 'aperto')")).toBe(2);
    const perso = await env.DB.prepare("SELECT stage_id, next_action, next_action_at, stage_changed_at FROM leads WHERE id = 'perso'").first<Record<string, unknown>>();
    expect(perso!.stage_id).toBe("in-attesa-decisione");
    expect(perso!.next_action).toBeTruthy();
    expect(perso!.next_action_at).toBeTypeOf("number");
    expect(perso!.stage_changed_at).toBeGreaterThan(NOW - 1000);
    const aperto = await env.DB.prepare("SELECT next_action, next_action_at FROM leads WHERE id = 'aperto'").first<Record<string, unknown>>();
    expect(aperto).toEqual({ next_action: "Richiamare", next_action_at: NOW + 3_600_000 });
  });

  it("tutto o niente: un responsabile inesistente non cambia nessun lead", async () => {
    const cookie = await authed();
    await insertLead("a");
    await insertLead("b");
    const r = await call("/api/leads/bulk", { method: "POST", json: { ids: ["a", "b"], azione: "responsabile", valore: "nessuno" } }, cookie);
    expect(r.status).toBe(400);
    expect(await conta("SELECT count(*) n FROM leads WHERE owner_id IS NOT NULL")).toBe(0);
    expect(await conta("SELECT count(*) n FROM audit_log WHERE entity = 'lead'")).toBe(0);
  });

  it("responsabile null toglie il responsabile", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await insertLead("a", { owner_id: "diego" });
    const r = await call("/api/leads/bulk", { method: "POST", json: { ids: ["a"], azione: "responsabile", valore: null } }, cookie);
    expect(await r.json()).toEqual({ fatti: 1 });
    expect(await conta("SELECT count(*) n FROM leads WHERE owner_id IS NULL")).toBe(1);
  });
});
