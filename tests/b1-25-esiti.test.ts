import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { daRoma } from "../worker/lib/roma";
import { CONTESTO_BASE, type Contesto } from "../worker/regole/motore";
import { transizione, type LeadTransizione } from "../worker/processo/transizione";
import { CALL_DELL_FASE, FASI_CON_CALL } from "../worker/regole/fasi-call";
import { ESITI_PER_FASE } from "../worker/leads/esito";
import { authed, call } from "./helpers";

// Blocco 1, modifica 25: una prova per ogni esito della tabella "Eventi ed esiti" e per gli eventi delle call.
const ORA = daRoma(2026, 10, 28, 11, 0); // mercoledì
const ENTRATA = daRoma(2026, 10, 27, 11, 0); // ingresso in fase: martedì
const c: Contesto = { ...CONTESTO_BASE, ora: ORA };
const CALL = daRoma(2026, 11, 3, 15, 0);
const lead = (stageId: string): LeadTransizione => ({ stageId, attemptCount: 0, primoTentativoAt: null, stageChangedAt: ENTRATA });
const esito = (stageId: string, e: Parameters<typeof transizione>[1] & { tipo: "esito" }) => transizione(lead(stageId), e, c);
const fineGiorno = (g: number, m = 10) => daRoma(2026, m, g, 19, 30);

describe("esiti della modifica 25", () => {
  it("conoscenza_fissata: 30 alla data della call", () => {
    expect(esito("da-richiamare", { tipo: "esito", esito: "conoscenza_fissata", call: { scheduledAt: CALL } }))
      .toMatchObject({ stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: CALL });
  });
  it("conoscenza_fatta: 35, Preparare l'offerta entro 3 giorni lavorativi", () => {
    expect(esito("appuntamento-confermato", { tipo: "esito", esito: "conoscenza_fatta" }))
      .toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Preparare l'offerta", nextActionAt: fineGiorno(31) });
  });
  it("offerta_pronta: resta in 35, Fissare la call dell'offerta entro 4 giorni lavorativi dall'ingresso", () => {
    expect(esito("in-attesa-preventivo", { tipo: "esito", esito: "offerta_pronta" }))
      .toMatchObject({ stageId: null, nextAction: "Fissare la call dell'offerta", nextActionAt: fineGiorno(31) });
  });
  it("offerta_fissata: 40 alla data della call", () => {
    expect(esito("in-attesa-preventivo", { tipo: "esito", esito: "offerta_fissata", call: { scheduledAt: CALL } }))
      .toMatchObject({ stageId: "presentazione-confermata", nextAction: "Call dell'offerta", nextActionAt: CALL });
  });
  it("offerta_presentata: con la call di analisi 45 alla data, senza resta 40 con Fissare la call di analisi a 2 giorni lavorativi", () => {
    expect(esito("presentazione-confermata", { tipo: "esito", esito: "offerta_presentata", call: { scheduledAt: CALL } }))
      .toMatchObject({ stageId: "analisi-fissata", nextAction: "Call di analisi", nextActionAt: CALL });
    expect(esito("presentazione-confermata", { tipo: "esito", esito: "offerta_presentata" }))
      .toMatchObject({ stageId: null, nextAction: "Fissare la call di analisi", nextActionAt: fineGiorno(30) });
  });
  it("analisi_fissata: 45 alla data della call", () => {
    expect(esito("presentazione-confermata", { tipo: "esito", esito: "analisi_fissata", call: { scheduledAt: CALL } }))
      .toMatchObject({ stageId: "analisi-fissata", nextAction: "Call di analisi", nextActionAt: CALL });
  });
  it("analisi_fatta: 50, Preparare il progetto entro 3 giorni lavorativi", () => {
    expect(esito("analisi-fissata", { tipo: "esito", esito: "analisi_fatta" }))
      .toMatchObject({ stageId: "in-attesa-progetto", nextAction: "Preparare il progetto", nextActionAt: fineGiorno(31) });
  });
  it("progetto_pronto: resta in 50, Fissare la call del progetto entro 4 giorni lavorativi dall'ingresso", () => {
    expect(esito("in-attesa-progetto", { tipo: "esito", esito: "progetto_pronto" }))
      .toMatchObject({ stageId: null, nextAction: "Fissare la call del progetto", nextActionAt: fineGiorno(31) });
  });
  it("progetto_fissato: 55 alla data della call", () => {
    expect(esito("in-attesa-progetto", { tipo: "esito", esito: "progetto_fissato", call: { scheduledAt: CALL } }))
      .toMatchObject({ stageId: "progetto-fissato", nextAction: "Call del progetto", nextActionAt: CALL });
  });
  it("progetto_presentato: 60 col follow-up come l'ex presentazione fatta", () => {
    expect(esito("progetto-fissato", { tipo: "esito", esito: "progetto_presentato" }))
      .toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: daRoma(2026, 10, 31, 10, 0) });
  });
});

describe("eventi delle call nei quattro tipi", () => {
  it("call_fissata porta nella fase della call", () => {
    const attese = { conoscenza: "appuntamento-confermato", offerta: "presentazione-confermata", analisi: "analisi-fissata", progetto: "progetto-fissato" } as const;
    for (const [kind, stageId] of Object.entries(attese)) {
      expect(transizione(lead(""), { tipo: "call_fissata", kind: kind as keyof typeof attese, scheduledAt: CALL }, c)).toMatchObject({ stageId, nextActionAt: CALL });
    }
  });
  it("call_fatta: conoscenza 35, offerta 40 con Fissare la call di analisi o 45 con la call già fissata, analisi 50, progetto 60", () => {
    const fatta = (kind: "conoscenza" | "offerta" | "analisi" | "progetto", prossimaAt: number | null = null) => transizione(lead(""), { tipo: "call_fatta", kind, prossimaAt }, c);
    expect(fatta("conoscenza")).toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Preparare l'offerta" });
    expect(fatta("offerta")).toMatchObject({ stageId: "presentazione-confermata", nextAction: "Fissare la call di analisi", nextActionAt: fineGiorno(30) });
    expect(fatta("offerta", CALL)).toMatchObject({ stageId: "analisi-fissata", nextAction: "Call di analisi", nextActionAt: CALL });
    expect(fatta("analisi")).toMatchObject({ stageId: "in-attesa-progetto", nextAction: "Preparare il progetto" });
    expect(fatta("progetto")).toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo" });
  });
  it("cambio_fase verso le fasi nuove: 45 e 55 aspettano la call, 50 prepara il progetto", () => {
    expect(transizione(lead(""), { tipo: "cambio_fase", stageId: "analisi-fissata" }, c)).toMatchObject({ stageId: "analisi-fissata", nextAction: "Call di analisi", nextActionAt: null });
    expect(transizione(lead(""), { tipo: "cambio_fase", stageId: "progetto-fissato" }, c)).toMatchObject({ stageId: "progetto-fissato", nextAction: "Call del progetto", nextActionAt: null });
    expect(transizione(lead(""), { tipo: "cambio_fase", stageId: "in-attesa-progetto" }, c)).toMatchObject({ stageId: "in-attesa-progetto", nextAction: "Preparare il progetto", nextActionAt: fineGiorno(31) });
  });
  it("le fasi con call sono quattro, una per tipo", () => {
    expect(FASI_CON_CALL).toEqual({ "appuntamento-confermato": "conoscenza", "presentazione-confermata": "offerta", "analisi-fissata": "analisi", "progetto-fissato": "progetto" });
    expect(CALL_DELL_FASE.offerta).toBe("presentazione-confermata");
  });
});

describe("ESITI_PER_FASE della modifica 25", () => {
  const CHIUSURE = ["non_interessato", "fuori_target"];
  it("una riga per fase aperta", () => {
    expect(ESITI_PER_FASE["da-chiamare-prima-volta"]).toEqual(["non_risponde", "occupato", "richiamare", "risposto", "conoscenza_fissata", ...CHIUSURE]);
    expect(ESITI_PER_FASE["appuntamento-confermato"]).toEqual(["conoscenza_fatta", "offerta_fissata", "richiamare", "non_risponde", "occupato", ...CHIUSURE]);
    expect(ESITI_PER_FASE["in-attesa-preventivo"]).toEqual(["offerta_pronta", "offerta_fissata", "richiamare", "non_risponde", "occupato", "risposto", ...CHIUSURE]);
    expect(ESITI_PER_FASE["presentazione-confermata"]).toEqual(["offerta_presentata", "analisi_fissata", "richiamare", "non_risponde", "occupato", ...CHIUSURE]);
    expect(ESITI_PER_FASE["analisi-fissata"]).toEqual(["analisi_fatta", "progetto_fissato", "richiamare", "non_risponde", "occupato", ...CHIUSURE]);
    expect(ESITI_PER_FASE["in-attesa-progetto"]).toEqual(["progetto_pronto", "progetto_fissato", "richiamare", "non_risponde", "occupato", "risposto", ...CHIUSURE]);
    expect(ESITI_PER_FASE["progetto-fissato"]).toEqual(["progetto_presentato", "richiamare", "non_risponde", "occupato", ...CHIUSURE]);
    expect(ESITI_PER_FASE["in-attesa-decisione"]).toEqual(["risposto", "richiamare", "non_risponde", "occupato", "progetto_fissato", ...CHIUSURE]);
  });
});

// Dal server: l'esito con la call crea la call del tipo giusto.
const NOW = Date.now();
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", source: "manuale", stage_id: "presentazione-confermata", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Call dell'offerta", next_action_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

describe("esito dal server con la call di analisi", () => {
  it("offerta_presentata con la call: lead in 45, call dell'offerta fatta, call di analisi creata", async () => {
    const cookie = await authed();
    await insertLead("x1");
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('kx', 'x1', 'offerta', ?, ?, ?)").bind(NOW - 3_600_000, NOW, NOW).run();
    const quando = NOW + 3 * 86_400_000;
    const r = await call("/api/leads/x1/esito", { method: "PATCH", json: { requestId: crypto.randomUUID(), esito: "offerta_presentata", call: { kind: "analisi", scheduledAt: quando, meetLink: null } } }, cookie);
    expect(r.status).toBe(200);
    expect(await env.DB.prepare("SELECT stage_id, next_action_at FROM leads WHERE id = 'x1'").first()).toEqual({ stage_id: "analisi-fissata", next_action_at: quando });
    const { results } = await env.DB.prepare("SELECT kind, outcome FROM calls WHERE lead_id = 'x1' ORDER BY scheduled_at").all();
    expect(results).toEqual([{ kind: "offerta", outcome: "fatta" }, { kind: "analisi", outcome: null }]);
  });

  it("no-show sulla call di analisi: prima assenza, la fase resta", async () => {
    const cookie = await authed();
    await insertLead("x2", { stage_id: "analisi-fissata" });
    const r = await call("/api/leads/x2/no-show", { method: "POST", json: { kind: "analisi" } }, cookie);
    expect(r.status).toBe(200);
    expect(await env.DB.prepare("SELECT stage_id, next_action, no_show FROM leads WHERE id = 'x2'").first()).toEqual({ stage_id: "analisi-fissata", next_action: "Rifissare la call", no_show: 1 });
  });
});

describe("call attesa da un invito di Google", () => {
  it("segue la fase e le call già fatte", async () => {
    const { callAttesa } = await import("../worker/regole/fasi-call");
    expect(callAttesa("da-richiamare", [])).toBe("conoscenza");
    expect(callAttesa("da-richiamare", ["conoscenza"])).toBe("offerta");
    expect(callAttesa("in-attesa-preventivo", [])).toBe("offerta");
    expect(callAttesa("presentazione-confermata", ["conoscenza", "offerta"])).toBe("analisi");
    expect(callAttesa("in-attesa-progetto", ["conoscenza"])).toBe("progetto");
    expect(callAttesa("in-attesa-decisione", ["progetto"])).toBe("progetto");
  });
});
