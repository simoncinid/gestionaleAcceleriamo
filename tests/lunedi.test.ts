import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { lavoraCoda } from "../worker/claude/coda";
import { setClaudeFetch } from "../worker/claude/fetcher";
import "../worker/claude/tipi";
import { giro, LAVORI } from "../worker/cron";
import { TIPI } from "../worker/claude/coda";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma, partiRoma } from "../worker/lib/roma";
import { calcolaSettimana, lunediDi, revisioneCorrente } from "../worker/lunedi/calcolo";
import { rispostaClaude } from "./claude-fixture";
import { call, createUser, loginCookie } from "./helpers";

const LUN = daRoma(2026, 10, 12, 7, 0); // lunedì 12 ottobre 2026, 7:00 di Roma
const SETT = daRoma(2026, 10, 5, 0, 0); // la settimana chiusa parte lunedì 5
const GIORNO = 86_400_000;
let cookie = "";

async function lead(id: string, campi: Record<string, string | number | null> = {}) {
  const base: Record<string, string | number | null> = { id, company: `Azienda ${id}`, source: "meta", stage_id: "da-richiamare", stage_changed_at: SETT + GIORNO, created_at: SETT + GIORNO, updated_at: SETT + GIORNO, meta_campaign: "Campagna A", ...campi };
  const k = Object.keys(base);
  await env.DB.prepare(`INSERT INTO leads (${k.join(", ")}) VALUES (${k.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...k.map((x) => base[x])).run();
}

beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
});

describe("settimana", () => {
  it("lunediDi: domenica sera appartiene alla settimana del lunedì prima, anche col cambio d'ora", () => {
    expect(lunediDi(daRoma(2026, 10, 11, 23, 30))).toEqual({ chiave: "2026-10-05", inizio: SETT });
    expect(lunediDi(daRoma(2026, 10, 26, 10, 0))).toEqual({ chiave: "2026-10-26", inizio: daRoma(2026, 10, 26, 0, 0) });
  });

  it("numeri della settimana chiusa, doppioni esclusi, fermi e proposte senza risposta", async () => {
    await lead("L1"); await lead("L2", { source: "foglio_andrea" }); await lead("D1", { duplicate_of_id: "L1" });
    await lead("VECCHIO", { created_at: SETT - 3 * GIORNO, stage_changed_at: LUN - 10 * GIORNO });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, outcome, created_at, updated_at) VALUES ('C1', 'L1', 'conoscenza', ?1, 'fatta', ?1, ?1)").bind(SETT + 2 * GIORNO).run();
    await env.DB.prepare(`INSERT INTO proposals (id, lead_id, number, company, setup_cents, status, presented_at, registered_via, created_at, updated_at)
      VALUES ('P1', 'VECCHIO', 'P-1', 'Azienda VECCHIO', 200000, 'presentata', ?1, 'manuale', ?1, ?1)`).bind(LUN - 15 * GIORNO).run();
    await env.DB.prepare("INSERT INTO campaign_spend (id, campagna, mese, amount_cents, updated_at) VALUES ('S1', 'Campagna A', '2026-10', 6000, 0)").run();
    const n = await calcolaSettimana(env.DB, LUN);
    expect(n).toMatchObject({ da: SETT, a: daRoma(2026, 10, 12, 0, 0), arrivati: 2, conoscenza: 1, presentazione: 0, proposte: 0, vinti: 0, spesaAdsMeseCents: 6000, costoPerLeadCents: 2000 });
    expect(n.perFonte).toEqual(expect.arrayContaining([{ source: "meta", n: 1 }, { source: "foglio_andrea", n: 1 }]));
    expect(n.fermi.map((f) => f.id)).toEqual(["VECCHIO"]);
    expect(n.proposteFerme).toEqual([{ id: "P1", leadId: "VECCHIO", company: "Azienda VECCHIO", giorni: 15 }]);
  });

  it("il giro delle 7 gira il lunedì e non duplica", async () => {
    const def = LAVORI.lunedi!;
    expect(def.quando(partiRoma(LUN))).toBe(true);
    expect(def.quando(partiRoma(LUN + 60 * 60_000))).toBe(false);
    expect(def.quando(partiRoma(LUN + GIORNO))).toBe(false);
    await def.esegui(env, LUN, 1);
    await def.esegui(env, LUN + 5 * 60_000, 1);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM weekly_reviews WHERE settimana = '2026-10-05'").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});

describe("giro delle 7 sul fuso di Roma", () => {
  it("le 7 sono quelle di Roma con l'ora legale e con l'ora solare; mai la domenica o alle 7 UTC", () => {
    const q = (ms: number) => LAVORI.lunedi!.quando(partiRoma(ms));
    expect(q(daRoma(2026, 3, 30, 7, 0))).toBe(true); // lunedì dopo il cambio all'ora legale
    expect(q(daRoma(2026, 10, 26, 7, 55))).toBe(true); // lunedì dopo il cambio all'ora solare
    expect(q(Date.UTC(2026, 9, 26, 7, 0))).toBe(false); // 7 UTC = 8 di Roma
    expect(q(daRoma(2026, 10, 26, 6, 59))).toBe(false);
    expect(q(daRoma(2026, 10, 11, 7, 0))).toBe(false); // domenica
  });

  it("misura: la prima revisione costa 14 query (fisse 15), quelle dopo una sola", async () => {
    const c1 = { query: 0 };
    const prima = await revisioneCorrente(contaD1(env.DB, c1), LUN);
    expect(prima.nuova).toBe(true);
    expect(c1.query).toBe(14);
    expect(c1.query).toBeLessThanOrEqual(LAVORI.lunedi!.fisse);
    const c2 = { query: 0 };
    expect(await revisioneCorrente(contaD1(env.DB, c2), LUN + 5 * 60_000)).toEqual({ id: prima.id, nuova: false });
    expect(c2.query).toBe(1);
  });

  it("giro quieto delle 7: la revisione nasce una volta, il giro resta sotto 45 query; alle 7:05 il lunedì ripassa senza doppioni", async () => {
    const g1 = await giro(env, LUN);
    expect(g1.errori).toEqual([]);
    expect(g1.fatti).toContain("lunedi");
    expect(g1.query).toBeLessThanOrEqual(45);
    const g2 = await giro(env, LUN + 5 * 60_000);
    expect(g2.fatti).toContain("lunedi");
    expect(g2.query).toBeLessThan(g1.query);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM weekly_reviews").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});

describe("rotte della revisione", () => {
  it("corrente la crea se manca, PATCH salva le decisioni e chiude", async () => {
    const r = await (await call("/api/weekly-reviews/corrente", {}, cookie)).json<{ id: string; decisioni: string[]; chiusaAt: number | null; commentoStato: string }>();
    expect(r.decisioni).toEqual(["", "", ""]);
    expect(r.commentoStato).toBe("nessuno");
    const p = await call(`/api/weekly-reviews/${r.id}`, { method: "PATCH", json: { decisioni: ["Pausa alla campagna B", "", ""], chiudi: true } }, cookie);
    expect(p.status).toBe(200);
    const d = await (await call("/api/weekly-reviews/corrente", {}, cookie)).json<{ decisioni: string[]; chiusaDa: string; chiusaAt: number }>();
    expect(d.decisioni[0]).toBe("Pausa alla campagna B");
    expect(d.chiusaDa).toBe("tommaso");
    expect(d.chiusaAt).toBeGreaterThan(0);
  });

  it("commento: va in coda, Claude riceve solo numeri e decisioni", async () => {
    await lead("L1", { company: "Officina Segreta", phone: "+393331234567", notes: "nota riservata", created_at: Date.now() - GIORNO });
    const { id } = await revisioneCorrente(env.DB, Date.now());
    await env.DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('C1', 'Cliente Riservato', 0)").run();
    await env.DB.prepare("INSERT INTO fees (id, client_id, amount_cents, status) VALUES ('F1', 'C1', 45000, 'attivo')").run();
    const r = await (await call(`/api/weekly-reviews/${id}/commento`, { method: "POST" }, cookie)).json<{ commentoStato: string }>();
    expect(r.commentoStato).toBe("in_coda");
    // Il lead nuovo da Meta fa partire anche la sua classificazione: si guarda solo la richiesta del commento.
    const corpi: string[] = [];
    setClaudeFetch(async (_u, init) => { corpi.push(String(init!.body)); return rispostaClaude({ testo: "Settimana tranquilla.\nDa decidere la campagna B." }); });
    await lavoraCoda(env, Date.now(), 3);
    const commenti = corpi.filter((c) => c.includes("<numeri>"));
    expect(commenti).toHaveLength(1);
    const corpo = commenti[0];
    expect(corpo).toContain("Lead arrivati:");
    expect(corpo).not.toContain("Officina Segreta");
    expect(corpo).not.toContain("Cliente Riservato");
    expect(corpo).not.toContain("450");
    expect(corpo).not.toContain("3331234567");
    expect(corpo).not.toContain("nota riservata");
    const d = await (await call("/api/weekly-reviews/corrente", {}, cookie)).json<{ commento: string; commentoStato: string }>();
    expect(d).toMatchObject({ commento: "Settimana tranquilla.\nDa decidere la campagna B.", commentoStato: "pronto" });
  });

  it("gestore del commento: 2 query, una sottorichiesta, il testo ripulito", async () => {
    const { id } = await revisioneCorrente(env.DB, LUN);
    await call(`/api/weekly-reviews/${id}/commento`, { method: "POST" }, cookie);
    const job = await env.DB.prepare("SELECT * FROM ai_jobs WHERE tipo = 'commento'").first<Record<string, unknown>>();
    let chiamate = 0;
    const lunga = Array.from({ length: 14 }, (_, i) => `Riga ${i + 1} \u2014 con una lineetta`).join("\n");
    setClaudeFetch(async () => { chiamate++; return rispostaClaude({ testo: lunga }); });
    const c = { query: 0 };
    const imp = { modelli: { commento: "claude-haiku-4-5" } } as Parameters<NonNullable<typeof TIPI.commento>["esegui"]>[2];
    await TIPI.commento!.esegui({ ...env, DB: contaD1(env.DB, c) }, { id: job!.id, entityId: id } as Parameters<NonNullable<typeof TIPI.commento>["esegui"]>[1], imp, LUN);
    expect(c.query).toBe(2);
    expect(chiamate).toBe(1);
    const r = await env.DB.prepare("SELECT commento FROM weekly_reviews WHERE id = ?1").bind(id).first<{ commento: string }>();
    expect(r!.commento.split("\n")).toHaveLength(10);
    expect(r!.commento).not.toMatch(/[\u2013\u2014]/);
    expect(r!.commento).toContain("Riga 1, con una lineetta");
  });

  it("commento vuoto dopo una risposta riuscita: errore col costo vero, la revisione resta senza commento", async () => {
    const { id } = await revisioneCorrente(env.DB, Date.now());
    await call(`/api/weekly-reviews/${id}/commento`, { method: "POST" }, cookie);
    setClaudeFetch(async () => rispostaClaude({ testo: "   ", ingresso: 900, uscita: 3 }));
    await lavoraCoda(env, Date.now(), 1);
    const u = await env.DB.prepare("SELECT stimato, ingresso FROM claude_usage WHERE tipo = 'commento'").first<{ stimato: number; ingresso: number }>();
    expect(u).toMatchObject({ stimato: 0, ingresso: 900 });
    const d = await (await call("/api/weekly-reviews/corrente", {}, cookie)).json<{ commento: string | null; commentoStato: string }>();
    expect(d).toMatchObject({ commento: null, commentoStato: "errore" });
  });

  it("revisione chiusa: 409 alle modifiche; id sconosciuto: 404", async () => {
    const { id } = await revisioneCorrente(env.DB, Date.now());
    await call(`/api/weekly-reviews/${id}`, { method: "PATCH", json: { chiudi: true } }, cookie);
    expect((await call(`/api/weekly-reviews/${id}`, { method: "PATCH", json: { decisioni: ["a", "b", "c"] } }, cookie)).status).toBe(409);
    expect((await call("/api/weekly-reviews/nessuna", { method: "PATCH", json: {} }, cookie)).status).toBe(404);
    expect((await call("/api/weekly-reviews/nessuna/commento", { method: "POST" }, cookie)).status).toBe(404);
    expect((await call(`/api/weekly-reviews/${id}`, { method: "PATCH", json: { decisioni: ["solo una"] } }, cookie)).status).toBe(400);
  });

  it("401 senza sessione", async () => {
    expect((await call("/api/weekly-reviews/corrente")).status).toBe(401);
    expect((await call("/api/weekly-reviews/x", { method: "PATCH", json: {} })).status).toBe(401);
    expect((await call("/api/weekly-reviews/x/commento", { method: "POST" })).status).toBe(401);
  });
});
