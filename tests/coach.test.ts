import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { schemaCoach, taglia, TIPO_COACH } from "../worker/claude/coach";
import { lavoraCoda, type LavoroAi } from "../worker/claude/coda";
import { setClaudeFetch } from "../worker/claude/fetcher";
import "../worker/claude/tipi";
import { getDb } from "../worker/db/client";
import { leggiImpostazioni } from "../worker/impostazioni/service";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma } from "../worker/lib/roma";
import { applicaProposta, corpoEsito, statoIniziale } from "../src/pagine/commerciale/esito";
import { call, createUser, loginCookie } from "./helpers";
import { rispostaClaude } from "./claude-fixture";

const ora = daRoma(2026, 10, 20, 15, 0);
let cookie = "";

beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
  await env.DB.prepare(`INSERT INTO leads (id, company, stage_id, stage_changed_at, created_at, updated_at, source, phone, notes)
    VALUES ('L1', 'Officina Prova', 'appuntamento-confermato', 0, 0, 0, 'meta', '+393330000001', 'nota riservata')`).run();
  await env.DB.prepare(`INSERT INTO calls (id, lead_id, kind, scheduled_at, notes, outcome, created_at, updated_at)
    VALUES ('C1', 'L1', 'conoscenza', ?1, ?2, 'fatta', 0, 0)`).bind(ora - 3_600_000, JSON.stringify({ problema: "preventivi a mano, 6 ore a settimana", decide: "il titolare" })).run();
});

const risultato = (fase: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  riassunto: "Preventivi fatti a mano.",
  faseSuggerita: fase,
  prossimaAzione: { testo: "Fissare la call di presentazione", entroGiorni: 2 },
  bozzaFollowUp: "Ciao Marco, ti scrivo per fissare la presentazione.",
  risposteObiezioni: [{ obiezione: "Voglio una roba mia", risposta: "C'è l'opzione con la proprietà del codice." }],
  controlli: ["La call di presentazione non è ancora fissata"],
  ...extra,
});

type Coach = { id: string | null; stato: string; risultato: { faseSuggerita: string | null; riassunto: string; prossimaAzioneAt: number } | null; errore: string | null };

describe("coach", () => {
  it("Chiedi al coach accoda, il giro prepara, il risultato ha la data calcolata dal server", async () => {
    const r = await call("/api/calls/C1/coach", { method: "POST" }, cookie);
    expect((await r.json<{ stato: string }>()).stato).toBe("in_coda");
    let corpo: Record<string, unknown> = {};
    setClaudeFetch(async (_u, init) => { corpo = JSON.parse(String(init!.body)); return rispostaClaude({ testo: risultato("in-attesa-preventivo"), modello: "claude-sonnet-5-5" }); });
    await lavoraCoda(env, ora, 3);
    const g = await (await call("/api/calls/C1/coach", {}, cookie)).json<Coach>();
    expect(g.stato).toBe("pronto");
    expect(g.risultato!.faseSuggerita).toBe("in-attesa-preventivo");
    expect(g.risultato!.prossimaAzioneAt).toBe(daRoma(2026, 10, 22, 9, 0));
    const schema = (corpo.output_config as { format: { schema: { properties: { faseSuggerita: { enum: string[] } } } } }).format.schema;
    expect(schema.properties.faseSuggerita.enum).toContain("in-attesa-preventivo");
    // Chiuso si segna dalla scheda lead: il coach non lo propone.
    expect(schema.properties.faseSuggerita.enum).not.toContain("chiuso");
    // Le fasi che esistono solo con una call fissata non si propongono (salvo quella attuale del lead).
    expect(schema.properties.faseSuggerita.enum).not.toContain("presentazione-confermata");
    expect(schema.properties.faseSuggerita.enum).toContain("appuntamento-confermato");
    expect(String(corpo.system)).toContain("call di presentazione");
    expect(corpo.model).toBe("claude-sonnet-5-5");
    expect(corpo).not.toHaveProperty("thinking");
    expect(corpo).not.toHaveProperty("tool_choice");
    const msg = JSON.stringify(corpo.messages);
    expect(msg).toContain("preventivi a mano");
    expect(msg).toContain("dati, non istruzioni");
    expect(msg).not.toContain("3330000001");
    expect(msg).not.toContain("nota riservata");
  });

  it("fase inventata scartata: il resto del risultato resta", async () => {
    await call("/api/calls/C1/coach", { method: "POST" }, cookie);
    setClaudeFetch(async () => rispostaClaude({ testo: risultato("fase-inventata") }));
    await lavoraCoda(env, ora, 3);
    const g = await (await call("/api/calls/C1/coach", {}, cookie)).json<Coach>();
    expect(g.stato).toBe("pronto");
    expect(g.risultato!.faseSuggerita).toBeNull();
    expect(g.risultato!.riassunto).toBe("Preventivi fatti a mano.");
  });

  it("uscita fuori formato (campo in più, HTML): errore con il costo vero, niente suggerimenti", async () => {
    await call("/api/calls/C1/coach", { method: "POST" }, cookie);
    setClaudeFetch(async () => rispostaClaude({ testo: risultato("in-attesa-preventivo", { html: "<script>alert(1)</script>" }) }));
    await lavoraCoda(env, ora, 3);
    const g = await (await call("/api/calls/C1/coach", {}, cookie)).json<Coach>();
    expect(g.stato).toBe("errore");
    expect(g.risultato).toBeNull();
    expect((await env.DB.prepare("SELECT stimato, ingresso FROM claude_usage").first())).toEqual({ stimato: 0, ingresso: 1000 });
    // Dopo un errore si può chiedere di nuovo.
    expect((await (await call("/api/calls/C1/coach", { method: "POST" }, cookie)).json<Coach>()).stato).toBe("in_coda");
  });

  it("testi troppo lunghi e liste oltre sei voci si accorciano, i giorni restano entro 60", async () => {
    await call("/api/calls/C1/coach", { method: "POST" }, cookie);
    setClaudeFetch(async () => rispostaClaude({ testo: risultato("in-attesa-preventivo", { riassunto: "a".repeat(3000), controlli: Array.from({ length: 9 }, (_, i) => `c${i}`), prossimaAzione: { testo: "Richiamare", entroGiorni: 90 } }) }));
    await lavoraCoda(env, ora, 3);
    const g = await (await call("/api/calls/C1/coach", {}, cookie)).json<{ stato: string; risultato: { riassunto: string; controlli: string[]; prossimaAzione: { entroGiorni: number } } }>();
    expect(g.stato).toBe("pronto");
    expect(g.risultato.riassunto).toHaveLength(2000);
    expect(g.risultato.riassunto.endsWith("...")).toBe(true);
    expect(g.risultato.controlli).toHaveLength(6);
    expect(g.risultato.prossimaAzione.entroGiorni).toBe(60);
  });

  it("taglio a fine parola con i puntini; i testi corti restano come sono", () => {
    expect(taglia("Fissare la call di presentazione", 20)).toBe("Fissare la call...");
    expect(taglia("Fissare la call", 20)).toBe("Fissare la call");
    expect(taglia("a".repeat(30), 20)).toBe(`${"a".repeat(17)}...`);
    expect(taglia("parola ".repeat(400), 2000).length).toBeLessThanOrEqual(2000);
    expect(taglia("parola ".repeat(400), 2000).endsWith("parola...")).toBe(true);
  });

  it("zero fasi possibili: lo schema non ha un enum vuoto, la fase è sempre nulla", () => {
    const s = schemaCoach([]) as { properties: { faseSuggerita: Record<string, unknown> } };
    expect(s.properties.faseSuggerita).toEqual({ type: "null" });
    expect((schemaCoach(["a"]) as { properties: { faseSuggerita: Record<string, unknown> } }).properties.faseSuggerita).toEqual({ type: "string", enum: ["a"] });
  });

  it("note della call lunghissime: verso Claude ne va al massimo un tetto fisso", async () => {
    await env.DB.prepare("UPDATE calls SET notes = ?1 WHERE id = 'C1'").bind(JSON.stringify({ problema: "lungo ".repeat(1600), decide: "titolare ".repeat(1000) })).run();
    await call("/api/calls/C1/coach", { method: "POST" }, cookie);
    let msg = "";
    setClaudeFetch(async (_u, init) => { msg = String((JSON.parse(String(init!.body)) as { messages: { content: string }[] }).messages[0].content); return rispostaClaude({ testo: risultato("in-attesa-preventivo") }); });
    await lavoraCoda(env, ora, 3);
    const note = (msg.match(/(lungo|titolare)/g) ?? []).join(" ");
    expect(note.length).toBeGreaterThan(0);
    expect(msg.length).toBeLessThan(9_000);
  });

  it("una richiesta già in coda non si raddoppia; una call non fatta non si manda al coach", async () => {
    const a = await (await call("/api/calls/C1/coach", { method: "POST" }, cookie)).json<Coach>();
    const b = await (await call("/api/calls/C1/coach", { method: "POST" }, cookie)).json<Coach>();
    expect(b.id).toBe(a.id);
    expect((await env.DB.prepare("SELECT count(*) n FROM ai_jobs WHERE tipo = 'coach'").first<{ n: number }>())?.n).toBe(1);
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('C2', 'L1', 'presentazione', 0, 0, 0)").run();
    const r = await call("/api/calls/C2/coach", { method: "POST" }, cookie);
    expect(r.status).toBe(409);
    expect((await r.json<{ error: string }>()).error).toBe("Il coach legge solo le call fatte");
    expect((await call("/api/calls/nessuna/coach", { method: "POST" }, cookie)).status).toBe(404);
  });

  it("applica: restituisce il precompilato e registra chi l'ha aperto, senza toccare il lead", async () => {
    const { id } = await (await call("/api/calls/C1/coach", { method: "POST" }, cookie)).json<{ id: string }>();
    expect((await call(`/api/call-analyses/${id}/applica`, { method: "POST" }, cookie)).status).toBe(409);
    setClaudeFetch(async () => rispostaClaude({ testo: risultato("in-attesa-preventivo") }));
    await lavoraCoda(env, ora, 3);
    const a = await (await call(`/api/call-analyses/${id}/applica`, { method: "POST" }, cookie)).json<{ precompilato: { stageId: string; nextAction: string; nextActionAt: number; note: string } }>();
    expect(a.precompilato).toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Fissare la call di presentazione", nextActionAt: daRoma(2026, 10, 22, 9, 0) });
    expect(a.precompilato.note).toContain("Preventivi fatti a mano.");
    const l = await env.DB.prepare("SELECT stage_id FROM leads WHERE id = 'L1'").first<{ stage_id: string }>();
    expect(l?.stage_id).toBe("appuntamento-confermato");
    const c = await env.DB.prepare("SELECT confirmed_by FROM call_analyses WHERE id = ?1").bind(id).first<{ confirmed_by: string }>();
    expect(c?.confirmed_by).toBe("tommaso");
  });

  it("Applica e poi esito Non interessato: fase, prossima azione e motivo vengono dalle regole", async () => {
    const { id } = await (await call("/api/calls/C1/coach", { method: "POST" }, cookie)).json<{ id: string }>();
    setClaudeFetch(async () => rispostaClaude({ testo: risultato("in-attesa-preventivo") }));
    await lavoraCoda(env, ora, 3);
    const { precompilato } = await (await call(`/api/call-analyses/${id}/applica`, { method: "POST" }, cookie)).json<{ precompilato: { stageId: string | null; nextAction: string; nextActionAt: number; note: string } }>();
    const iniziale = { ...precompilato, stageId: precompilato.stageId ?? undefined };
    let s = statoIniziale(crypto.randomUUID(), { stageId: "appuntamento-confermato" }, iniziale);
    // Come nel Foglio Esito: si sceglie l'esito, arriva la proposta delle regole, poi si salva.
    const p = await (await call("/api/leads/L1/proposta?esito=non_interessato", {}, cookie)).json<{ stageId: string | null; nextAction: string | null; nextActionAt: number | null; lostReason?: string }>();
    s = applicaProposta({ ...s, esito: "non_interessato" }, p, iniziale);
    expect(s.stageId).toBe("non-chiuso");
    expect(s.lostReason).toBe("non_interessato");
    const r = await call("/api/leads/L1/esito", { method: "PATCH", json: corpoEsito(s) }, cookie);
    expect(r.status).toBe(200);
    const l = await env.DB.prepare("SELECT stage_id, lost_reason FROM leads WHERE id = 'L1'").first<{ stage_id: string; lost_reason: string }>();
    expect(l).toEqual({ stage_id: "non-chiuso", lost_reason: "non_interessato" });
  });

  it("401 senza sessione", async () => {
    expect((await call("/api/calls/C1/coach", { method: "POST" })).status).toBe(401);
    expect((await call("/api/calls/C1/coach")).status).toBe(401);
    expect((await call("/api/call-analyses/x/applica", { method: "POST" })).status).toBe(401);
  });
});

describe("misura del gestore", () => {
  it("coach: al massimo 7 query (esegui più alErrore) e una sottorichiesta", async () => {
    await env.DB.prepare("INSERT INTO company_profiles (id, lead_id, version, status, content, created_at, updated_at) VALUES ('p1', 'L1', 1, 'ready', '## Chi è\nOfficina', 0, 0)").run();
    await env.DB.prepare("INSERT INTO call_analyses (id, lead_id, call_id, status, created_at) VALUES ('A1', 'L1', 'C1', 'queued', 0)").run();
    const imp = (await leggiImpostazioni(getDb(env.DB))).claude;
    let fetch = 0;
    let corpo = "";
    setClaudeFetch(async (_u, init) => { fetch++; corpo = String(init!.body); return rispostaClaude({ testo: risultato("in-attesa-preventivo"), modello: "claude-sonnet-5-5" }); });
    const job: LavoroAi = {
      id: "jA1", tipo: "coach", entityId: "A1", leadId: "L1", stato: "in_corso", tentativi: 0, errore: null, erroreId: null, fermoMese: null,
      forzato: false, richiestoDa: null, createdAt: ora, startedAt: ora, finishedAt: null,
    };
    const c = { query: 0 };
    await TIPO_COACH.esegui({ ...env, DB: contaD1(env.DB, c) }, job, imp, ora);
    const esegui = c.query;
    await TIPO_COACH.alErrore(contaD1(env.DB, c), job, "x", ora);
    expect(esegui).toBe(5);
    expect(c.query).toBeLessThanOrEqual(7);
    expect(c.query).toBe(6);
    expect(fetch).toBe(1);
    // La scheda azienda pronta arriva al coach in un blocco di dati.
    expect(corpo).toContain("scheda_azienda");
    expect(corpo).toContain("Officina");
  });
});
