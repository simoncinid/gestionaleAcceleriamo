import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { calcolaCampagne, livelloCosto } from "../worker/numeri/campagne";
import { calcolaPrevisione, valoriLead } from "../worker/numeri/previsione";
import { calcolaFunnel, percentualeOnesta, tempiPerFase } from "../worker/numeri/funnel";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma } from "../worker/lib/roma";
import { call, createUser, loginCookie } from "./helpers";

const T0 = daRoma(2026, 10, 5, 10, 0); // lunedì 5 ottobre 2026, 10:00 di Roma
const ORA = 3_600_000;
let cookie = "";

async function lead(id: string, campi: Record<string, string | number | null> = {}) {
  const base: Record<string, string | number | null> = {
    id, company: `Azienda ${id}`, source: "meta", stage_id: "da-chiamare-prima-volta", stage_changed_at: T0,
    created_at: T0, updated_at: T0, meta_campaign: "Campagna A", meta_ad: "Video 1", ...campi,
  };
  const k = Object.keys(base);
  await env.DB.prepare(`INSERT INTO leads (${k.join(", ")}) VALUES (${k.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...k.map((x) => base[x])).run();
}
const attivita = (leadId: string, type: string, at: number, body = "") =>
  env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(crypto.randomUUID(), leadId, type, body, at).run();
const callFatta = (leadId: string, kind: string) =>
  env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, outcome, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'fatta', ?4, ?4)").bind(crypto.randomUUID(), leadId, kind, T0 + 24 * ORA).run();
const proposta = (leadId: string, n: string, campi: { option?: string; setup: number; fee: number | null; status: string; at: number }) =>
  env.DB.prepare(`INSERT INTO proposals (id, lead_id, number, company, option, setup_cents, fee_cents, status, presented_at, registered_via, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'x', ?4, ?5, ?6, ?7, ?8, 'manuale', ?9, ?9)`).bind(crypto.randomUUID(), leadId, n, campi.option ?? "standard", campi.setup, campi.fee, campi.status, campi.status === "presentata" ? campi.at : null, campi.at).run();

beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
});

describe("funzioni pure", () => {
  it("percentuale onesta: null sotto 5", () => {
    expect(percentualeOnesta(4, 4)).toBeNull();
    expect(percentualeOnesta(4, 5)).toBe(80);
  });
  it("tempi per fase dai cambi di fase della 1A", () => {
    const fasi = [{ id: "da-richiamare", label: "Da richiamare" }, { id: "appuntamento-confermato", label: "Consulenza fissata" }];
    const t = tempiPerFase([
      { leadId: "A", at: 0, body: 'Da "Da chiamare la prima volta" a "Da richiamare"' },
      { leadId: "A", at: 2 * 86_400_000, body: 'Da "Da richiamare" a "Consulenza fissata"' },
      { leadId: "B", at: 0, body: 'Da "Da chiamare la prima volta" a "Da richiamare"' },
      { leadId: "B", at: 86_400_000, body: 'Da "Da richiamare" a "Consulenza fissata"' },
    ], fasi);
    expect(t).toEqual([{ stageId: "da-richiamare", label: "Da richiamare", giorniMedi: 1.5, passaggi: 2 }]);
  });
  it("livelli di costo contro 8, 13, 16 euro", () => {
    const s: [number, number, number] = [800, 1300, 1600];
    expect(livelloCosto(null, s)).toBe("senza_spesa");
    expect(livelloCosto(800, s)).toBe("buono");
    expect(livelloCosto(1200, s)).toBe("accettabile");
    expect(livelloCosto(1600, s)).toBe("attenzione");
    expect(livelloCosto(1601, s)).toBe("stop");
  });
  it("proprietà solo setup", () => {
    expect(valoriLead({ setupCents: 200_000, feeCents: 30_000, estimatedValue: null }, { option: "proprieta", setupCents: 1_400_000, feeCents: 30_000 })).toEqual({ setupCents: 1_400_000, feeCents: 0 });
  });
  it("valore della 1A: senza setup usa estimated_value in euro", () => {
    expect(valoriLead({ setupCents: null, feeCents: null, estimatedValue: 3000 }, null)).toEqual({ setupCents: 300_000, feeCents: 0 });
  });
});

describe("GET /api/numeri/funnel", () => {
  it("n.d. sotto 5: quattro lead tutti chiamati in tempo non danno una percentuale", async () => {
    for (const id of ["L1", "L2", "L3", "L4"]) { await lead(id); await attivita(id, "chiamata", T0 + 30 * 60_000); }
    const f = await (await call(`/api/numeri/funnel?from=${T0 - ORA}&until=${T0 + ORA}`, {}, cookie)).json<{ sla: { percentuale: number | null; dentro: number; totale: number } }>();
    expect(f.sla).toEqual({ percentuale: null, dentro: 4, totale: 4 });
  });

  it("tappe sulla stessa coorte, doppione escluso, SLA all'80%", async () => {
    for (const id of ["L1", "L2", "L3", "L4", "L5"]) await lead(id);
    await lead("D1", { duplicate_of_id: "L1" });
    for (const id of ["L1", "L2", "L3", "L4"]) await attivita(id, "chiamata", T0 + 30 * 60_000);
    await attivita("L5", "chiamata", T0 + 5 * ORA);
    await callFatta("L1", "conoscenza"); await callFatta("L2", "conoscenza"); await callFatta("L1", "offerta");
    await proposta("L1", "P-1", { setup: 200_000, fee: 30_000, status: "presentata", at: T0 + 48 * ORA });
    await env.DB.prepare("UPDATE leads SET stage_id = 'non-chiuso', lost_reason = 'budget' WHERE id = 'L3'").run();
    const f = await (await call(`/api/numeri/funnel?from=${T0 - ORA}&until=${T0 + ORA}`, {}, cookie)).json<{
      tappe: { chiave: string; numero: number }[]; sla: { percentuale: number }; motivi: { id: string; etichetta: string; numero: number }[];
      call: Record<string, number | null>; bySource: unknown[];
    }>();
    expect(f.tappe.map((t) => [t.chiave, t.numero])).toEqual([["arrivati", 5], ["sla", 4], ["conoscenza", 2], ["offerta", 1], ["analisi", 0], ["progetto", 0], ["proposte", 1], ["chiusi", 0]]);
    expect(f.sla.percentuale).toBe(80);
    expect(f.motivi).toEqual([{ id: "budget", etichetta: "Budget", numero: 1 }]);
    expect(f.call).toEqual({ conoscenza: 2, offerta: 1, analisi: 0, progetto: 0, rapporto: null });
    expect(Array.isArray(f.bySource)).toBe(true);
  });

  it("prima risposta sulla coorte: niente doppioni né lead manuali", async () => {
    await lead("L1"); await lead("L2");
    await lead("D1", { duplicate_of_id: "L1" });
    await lead("M1", { source: "manuale" });
    await attivita("L1", "chiamata", T0 + 30 * 60_000);
    await attivita("L2", "chiamata", T0 + 90 * 60_000);
    await attivita("D1", "chiamata", T0 + 10 * ORA);
    await attivita("M1", "chiamata", T0 + 10 * ORA);
    const f = await (await call(`/api/numeri/funnel?from=${T0 - ORA}&until=${T0 + ORA}`, {}, cookie)).json<{
      primaRisposta: { mediaMs: number | null; numero: number }; firstResponse: { count: number };
    }>();
    expect(f.primaRisposta).toEqual({ mediaMs: 60 * 60_000, numero: 2 });
    expect(f.firstResponse.count).toBe(4);
  });

  it("/api/stats è un alias con la stessa risposta", async () => {
    await lead("L1");
    const a = await (await call(`/api/stats?from=${T0 - ORA}&until=${T0 + ORA}`, {}, cookie)).json();
    const b = await (await call(`/api/numeri/funnel?from=${T0 - ORA}&until=${T0 + ORA}`, {}, cookie)).json();
    expect(a).toEqual(b);
  });
});

describe("GET /api/numeri/campagne", () => {
  it("doppione contato una volta, costo per lead e stop loss", async () => {
    await lead("L1"); await lead("L2", { source: "foglio_andrea", duplicate_of_id: "L1" });
    await lead("L3", { meta_campaign: "Campagna B", meta_ad: "Foto 2" });
    const r = await call("/api/campaign-spend", { method: "PUT", json: { campagna: "Campagna A", mese: "2026-10", amountCents: 2_000 } }, cookie);
    expect(r.status).toBe(200);
    const c = await (await call("/api/numeri/campagne?mese=2026-10", {}, cookie)).json<{
      campagne: { campagna: string; lead: number; spesaCents: number | null; costoPerLeadCents: number | null; livello: string; inserzioni: { inserzione: string; lead: number }[] }[];
    }>();
    const a = c.campagne.find((x) => x.campagna === "Campagna A")!;
    expect(a).toMatchObject({ lead: 1, spesaCents: 2_000, costoPerLeadCents: 2_000, livello: "stop" });
    expect(a.inserzioni).toEqual([expect.objectContaining({ inserzione: "Video 1", lead: 1 })]);
    expect(c.campagne.find((x) => x.campagna === "Campagna B")).toMatchObject({ lead: 1, spesaCents: null, livello: "senza_spesa" });
  });

  it("spesa zero: nessun costo per lead e niente punto verde", async () => {
    await lead("L1");
    await call("/api/campaign-spend", { method: "PUT", json: { campagna: "Campagna A", mese: "2026-10", amountCents: 0 } }, cookie);
    const c = await (await call("/api/numeri/campagne?mese=2026-10", {}, cookie)).json<{ campagne: { campagna: string; spesaCents: number | null; costoPerLeadCents: number | null; livello: string }[] }>();
    expect(c.campagne.find((x) => x.campagna === "Campagna A")).toMatchObject({ spesaCents: 0, costoPerLeadCents: null, livello: "senza_spesa" });
  });

  it("confine del mese a Roma: un lead alle 00:30 del 1 novembre (23:30 UTC del 31 ottobre) conta in novembre", async () => {
    const t = daRoma(2026, 11, 1, 0, 30);
    expect(new Date(t).toISOString()).toBe("2026-10-31T23:30:00.000Z");
    await lead("NOV", { created_at: t, stage_changed_at: t, meta_campaign: "Campagna Confine" });
    const leggi = async (mese: string) =>
      (await (await call(`/api/numeri/campagne?mese=${mese}`, {}, cookie)).json<{ campagne: { campagna: string; lead: number }[] }>()).campagne.find((x) => x.campagna === "Campagna Confine");
    expect(await leggi("2026-10")).toBeUndefined();
    expect(await leggi("2026-11")).toMatchObject({ lead: 1 });
  });

  it("la spesa si aggiorna, non si duplica", async () => {
    for (const amountCents of [1_000, 1_500]) await call("/api/campaign-spend", { method: "PUT", json: { campagna: "Campagna A", mese: "2026-10", amountCents } }, cookie);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(amount_cents) AS v FROM campaign_spend").first<{ n: number; v: number }>();
    expect(n).toEqual({ n: 1, v: 1_500 });
  });
});

describe("GET /api/numeri/previsione", () => {
  it("proposta aperta più recente, proprietà solo setup, ricorrente dai canoni attivi", async () => {
    await env.DB.prepare("UPDATE stages SET probability = 50 WHERE id = 'in-attesa-decisione'").run();
    await env.DB.prepare("UPDATE stages SET probability = 20 WHERE id = 'appuntamento-confermato'").run();
    await lead("L1", { stage_id: "in-attesa-decisione" });
    await proposta("L1", "P-1", { setup: 100_000, fee: 20_000, status: "presentata", at: T0 });
    await proposta("L1", "P-2", { setup: 300_000, fee: 40_000, status: "registrata", at: T0 + ORA });
    await proposta("L1", "P-3", { setup: 900_000, fee: 90_000, status: "rifiutata", at: T0 + 2 * ORA });
    await lead("L2", { stage_id: "in-attesa-decisione" });
    await proposta("L2", "P-4", { option: "proprieta", setup: 1_400_000, fee: 30_000, status: "presentata", at: T0 });
    await lead("L3", { stage_id: "appuntamento-confermato", estimated_value: 3000 });
    await lead("L4", { stage_id: "non-chiuso", setup_cents: 500_000 });
    await env.DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('C1', 'Cliente', 0)").run();
    await env.DB.prepare("INSERT INTO fees (id, client_id, amount_cents, status) VALUES ('F1', 'C1', 50000, 'attivo'), ('F2', 'C1', 30000, 'in_attesa')").run();
    const p = await (await call("/api/numeri/previsione", {}, cookie)).json<{ setupTotaleCents: number; canoneTotaleCents: number; setupPesatoCents: number; canonePesatoCents: number; ricorrenteCents: number; obiettivoCents: number; lead: number }>();
    expect(p.setupTotaleCents).toBe(300_000 + 1_400_000 + 300_000);
    expect(p.canoneTotaleCents).toBe(40_000);
    expect(p.setupPesatoCents).toBe(150_000 + 700_000 + 60_000);
    expect(p.canonePesatoCents).toBe(20_000);
    expect(p).toMatchObject({ ricorrenteCents: 50_000, obiettivoCents: 200_000, lead: 3 });
  });

  it("401 senza sessione", async () => {
    for (const p of ["/api/numeri/funnel", "/api/numeri/campagne", "/api/numeri/previsione"]) expect((await call(p)).status).toBe(401);
    expect((await call("/api/campaign-spend", { method: "PUT", json: {} })).status).toBe(401);
  });
});

describe("budget di D1", () => {
  it("ogni calcolo dei Numeri resta ben sotto le 50 query, con tanti lead come con pochi", async () => {
    for (let i = 0; i < 30; i++) {
      await lead(`L${i}`, { meta_campaign: `Campagna ${i % 3}` });
      await attivita(`L${i}`, "chiamata", T0 + 30 * 60_000);
      if (i % 2) await callFatta(`L${i}`, "conoscenza");
    }
    const misura = async (f: (db: D1Database) => Promise<unknown>) => {
      const c = { query: 0 };
      await f(contaD1(env.DB, c));
      return c.query;
    };
    const funnel = await misura((db) => calcolaFunnel(db, T0 - ORA, T0 + ORA));
    const campagne = await misura((db) => calcolaCampagne(db, "2026-10"));
    const previsione = await misura((db) => calcolaPrevisione(db));
    expect(funnel).toBe(11);
    expect(campagne).toBe(3);
    expect(previsione).toBe(3);
  });
});
