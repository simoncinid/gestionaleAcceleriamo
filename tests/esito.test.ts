import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

const NOW = Date.now();

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", phone: "+393330000001", source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, next_action: "Richiamare", next_action_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const conta = async (sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first<{ n: number }>())!.n;
const leadRow = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
const esito = (id: string, json: unknown, cookie: string) => call(`/api/leads/${id}/esito`, { method: "PATCH", json }, cookie);

describe("esito della consulenza e della presentazione", () => {
  it("consulenza fatta: fase In attesa preventivo e la call di conoscenza in programma diventa fatta", async () => {
    const cookie = await authed();
    await insertLead("c1", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_by, created_at, updated_at) VALUES ('k1', 'c1', 'conoscenza', ?, 'x', 1, 1)").bind(NOW - 3_600_000).run();
    const res = await esito("c1", { requestId: crypto.randomUUID(), esito: "consulenza_fatta", stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: NOW + 86_400_000 }, cookie);
    expect(res.status).toBe(200);
    expect(await leadRow("c1")).toMatchObject({ stage_id: "in-attesa-preventivo", next_action: "Preparare il preventivo" });
    expect(await env.DB.prepare("SELECT outcome FROM calls WHERE id = 'k1'").first()).toEqual({ outcome: "fatta" });
    const a = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'c1' AND type = 'esito'").first();
    expect(a).toEqual({ body: "Consulenza fatta" });
  });

  it("presentazione fissata: crea la call di presentazione e sposta in Presentazione fissata", async () => {
    const cookie = await authed();
    await insertLead("c2", { stage_id: "in-attesa-preventivo" });
    const quando = NOW + 2 * 86_400_000;
    const res = await esito("c2", { requestId: crypto.randomUUID(), esito: "presentazione_fissata", stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: quando, call: { kind: "presentazione", scheduledAt: quando, meetLink: "meet.google.com/abc-defg-hij" } }, cookie);
    expect(res.status).toBe(200);
    expect(await env.DB.prepare("SELECT kind, meet_link FROM calls WHERE lead_id = 'c2'").first()).toEqual({ kind: "presentazione", meet_link: "https://meet.google.com/abc-defg-hij" });
    expect((await leadRow("c2"))?.stage_id).toBe("presentazione-confermata");
  });
});

describe("PATCH /leads/:id/esito", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/leads/x/esito", { method: "PATCH", json: {} })).status).toBe(401);
  });

  it("scrive attività con esito e tentativo, fase, prossima azione", async () => {
    const cookie = await authed();
    await insertLead("l1");
    const res = await esito("l1", { requestId: crypto.randomUUID(), esito: "non_risponde", stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: NOW + 86_400_000, note: "Squilla a vuoto" }, cookie);
    expect(res.status).toBe(200);
    const a = await env.DB.prepare("SELECT type, outcome, attempt_no, body FROM activities WHERE lead_id = 'l1' AND type = 'esito'").first();
    expect(a).toEqual({ type: "esito", outcome: "non_risponde", attempt_no: 1, body: "Non risponde. Squilla a vuoto" });
    expect(await leadRow("l1")).toMatchObject({ attempt_count: 1, next_action_at: NOW + 86_400_000, first_response_at: null });
  });

  it("appuntamento: crea la call, cambia fase, segna la prima risposta", async () => {
    const cookie = await authed();
    await insertLead("l2");
    const quando = NOW + 2 * 86_400_000;
    const res = await esito("l2", { requestId: crypto.randomUUID(), esito: "appuntamento", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: quando, call: { kind: "conoscenza", scheduledAt: quando, meetLink: "https://meet.google.com/abc-defg-hij" } }, cookie);
    const body = (await res.json()) as { callId: string };
    expect(body.callId).toBeTruthy();
    expect(await conta("SELECT count(*) n FROM calls WHERE lead_id = 'l2' AND kind = 'conoscenza' AND scheduled_at = ?", quando)).toBe(1);
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'l2' AND type = 'cambio_fase'")).toBe(1);
    const l = await leadRow("l2");
    expect(l?.stage_id).toBe("appuntamento-confermato");
    expect(l?.first_response_at).toBeTypeOf("number");
  });

  it("fase con call senza call (né nell'esito né in programma): 422 come nel PATCH, niente scritto", async () => {
    const cookie = await authed();
    await insertLead("lc");
    const quando = NOW + 2 * 86_400_000;
    const res = await esito("lc", { requestId: crypto.randomUUID(), esito: "risposto", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: quando }, cookie);
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe("Per questa fase serve la call: scegli giorno e ora");
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'lc'")).toBe(0);
    expect((await leadRow("lc"))!.stage_id).toBe("da-richiamare");
    // Con una call di conoscenza già in programma l'esito passa.
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('kc', 'lc', 'conoscenza', ?1, 0, 0)").bind(quando).run();
    const ok = await esito("lc", { requestId: crypto.randomUUID(), esito: "risposto", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: quando }, cookie);
    expect(ok.status).toBe(200);
  });

  it("call nel passato: 422 con un messaggio in italiano, niente scritto", async () => {
    const cookie = await authed();
    await insertLead("lp");
    const ieri = NOW - 86_400_000;
    const res = await esito("lp", { requestId: crypto.randomUUID(), esito: "appuntamento", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: NOW + 3_600_000, call: { kind: "conoscenza", scheduledAt: ieri, meetLink: null } }, cookie);
    expect(res.status).toBe(422);
    expect((await res.json<{ error: string }>()).error).toBe("La call è nel passato: scegli giorno e ora da adesso in poi");
    expect(await conta("SELECT count(*) n FROM calls WHERE lead_id = 'lp'")).toBe(0);
    // Dieci minuti fa sta nella tolleranza.
    const quasi = await call("/api/leads/lp/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: Date.now() - 10 * 60_000, meetLink: null } }, cookie);
    expect(quasi.status).toBe(201);
    const vecchia = await call("/api/leads/lp/calls", { method: "POST", json: { kind: "conoscenza", scheduledAt: ieri, meetLink: null } }, cookie);
    expect(vecchia.status).toBe(422);
  });

  it("fase persa senza motivo: 422 e niente scritto", async () => {
    const cookie = await authed();
    await insertLead("l3");
    const res = await esito("l3", { requestId: crypto.randomUUID(), esito: "non_interessato", stageId: "non-chiuso", nextAction: null, nextActionAt: null }, cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("Scegli il motivo");
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'l3'")).toBe(0);
  });

  it("tutto o niente: se la call non si scrive, non si scrive nulla", async () => {
    const cookie = await authed();
    await insertLead("l4");
    await env.DB.prepare("CREATE TRIGGER blocca_call BEFORE INSERT ON calls BEGIN SELECT RAISE(ABORT, 'prova'); END").run();
    const res = await esito("l4", { requestId: crypto.randomUUID(), esito: "appuntamento", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: NOW + 1000, call: { kind: "conoscenza", scheduledAt: NOW + 1000, meetLink: null } }, cookie);
    expect(res.status).toBe(500);
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'l4'")).toBe(0);
    expect((await leadRow("l4"))?.stage_id).toBe("da-richiamare");
  });

  it("stessa richiesta due volte (doppio tocco o rete lenta): un solo esito, un solo tentativo, una sola call", async () => {
    const cookie = await authed();
    await insertLead("l5");
    const corpo = { requestId: crypto.randomUUID(), esito: "appuntamento", stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: NOW + 5000, call: { kind: "conoscenza", scheduledAt: NOW + 5000, meetLink: null } };
    const [a, b] = await Promise.all([esito("l5", corpo, cookie), esito("l5", corpo, cookie)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const c = await esito("l5", corpo, cookie);
    expect(((await c.json()) as { duplicato: boolean }).duplicato).toBe(true);
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'l5' AND type = 'esito'")).toBe(1);
    expect(await conta("SELECT count(*) n FROM calls WHERE lead_id = 'l5'")).toBe(1);
  });

  it("il tentativo conta una volta sola anche ripetendo non_risponde con la stessa richiesta", async () => {
    const cookie = await authed();
    await insertLead("l6");
    const corpo = { requestId: crypto.randomUUID(), esito: "non_risponde", stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: NOW + 1000 };
    await esito("l6", corpo, cookie);
    await esito("l6", corpo, cookie);
    expect((await leadRow("l6"))?.attempt_count).toBe(1);
  });
});

describe("contatti e proposta", () => {
  it("registra la chiamata avviata senza contare il tentativo", async () => {
    const cookie = await authed();
    await insertLead("c1");
    expect((await call("/api/leads/c1/contatti", { method: "POST", json: { canale: "chiamata" } }, cookie)).status).toBe(201);
    expect(await env.DB.prepare("SELECT type, body FROM activities WHERE lead_id = 'c1'").first()).toEqual({ type: "contatto", body: "Chiamata avviata" });
    expect((await leadRow("c1"))?.attempt_count).toBe(0);
  });

  it("il WhatsApp Non ti ho trovato è un tentativo della sequenza", async () => {
    const cookie = await authed();
    await insertLead("c2", { attempt_count: 1 });
    await call("/api/leads/c2/contatti", { method: "POST", json: { canale: "whatsapp", modello: "mod-non-trovato" } }, cookie);
    expect(await env.DB.prepare("SELECT body, attempt_no FROM activities WHERE lead_id = 'c2'").first()).toEqual({ body: "Messaggio aperto in WhatsApp (modello Non ti ho trovato)", attempt_no: 2 });
    expect((await leadRow("c2"))?.attempt_count).toBe(2);
  });

  it("propone il passo dal motore", async () => {
    const cookie = await authed();
    await insertLead("c3");
    const p = (await (await call("/api/leads/c3/proposta?esito=non_risponde", {}, cookie)).json()) as { passo: string; nextAction: string };
    expect(p.passo).toBe("Tentativo 1 di 5");
    expect(p.nextAction).toBe("Richiamare");
  });
});

describe("PATCH /leads/:id con motivo e vinto", () => {
  it("fase persa chiede il motivo, Chiuso chiede setup, canone e inizio", async () => {
    const cookie = await authed();
    await insertLead("v1");
    expect((await call("/api/leads/v1", { method: "PATCH", json: { stageId: "fake" } }, cookie)).status).toBe(422);
    expect((await call("/api/leads/v1", { method: "PATCH", json: { stageId: "fake", lostReason: "fake" } }, cookie)).status).toBe(200);
    await insertLead("v2");
    const senza = await call("/api/leads/v2", { method: "PATCH", json: { stageId: "chiuso" } }, cookie);
    expect(((await senza.json()) as { error: string }).error).toBe("Per Cliente servono setup, canone e data di inizio");
    const con = await call("/api/leads/v2", { method: "PATCH", json: { stageId: "chiuso", setupCents: 200_000, feeCents: 15_000, wonStartAt: NOW } }, cookie);
    expect(con.status).toBe(200);
  });
});

describe("motivi da Impostazioni e controlli solo al cambio di fase", () => {
  it("un motivo aggiunto in Impostazioni vale, uno sconosciuto no", async () => {
    const cookie = await authed();
    const motivi = [{ id: "concorrente", etichetta: "Ha scelto un concorrente" }, { id: "fake", etichetta: "Fake" }];
    await env.DB.prepare("INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('motivi', ?, NULL, ?)").bind(JSON.stringify(motivi), NOW).run();
    await insertLead("m1");
    const ok = await call("/api/leads/m1", { method: "PATCH", json: { stageId: "non-chiuso", lostReason: "concorrente" } }, cookie);
    expect(ok.status).toBe(200);
    expect((await leadRow("m1"))?.lost_reason).toBe("concorrente");
    await insertLead("m2");
    const no = await call("/api/leads/m2", { method: "PATCH", json: { stageId: "non-chiuso", lostReason: "inventato" } }, cookie);
    expect(no.status).toBe(422);
    expect(((await no.json()) as { error: string }).error).toBe("Motivo non valido");
    await insertLead("m3");
    const daEsito = await esito("m3", { requestId: crypto.randomUUID(), esito: "non_interessato", stageId: "non-chiuso", nextAction: null, nextActionAt: null, lostReason: "inventato" }, cookie);
    expect(daEsito.status).toBe(422);
    expect(await conta("SELECT count(*) n FROM activities WHERE lead_id = 'm3'")).toBe(0);
    await insertLead("m4");
    const esitoOk = await esito("m4", { requestId: crypto.randomUUID(), esito: "non_interessato", stageId: "non-chiuso", nextAction: null, nextActionAt: null, lostReason: "concorrente" }, cookie);
    expect(esitoOk.status).toBe(200);
    expect((await leadRow("m4"))?.lost_reason).toBe("concorrente");
    // Collaudo 26/10, voce 3: il motivo si legge nello storico.
    expect(await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'm4' AND type = 'esito'").first("body")).toBe("Non interessato. Motivo: Ha scelto un concorrente");
  });

  it("un lead 1A già perso senza motivo accetta una modifica che non cambia fase", async () => {
    const cookie = await authed();
    await insertLead("p1", { stage_id: "non-chiuso", next_action: null, next_action_at: null });
    const res = await call("/api/leads/p1", { method: "PATCH", json: { notes: "Nota dopo la migrazione" } }, cookie);
    expect(res.status).toBe(200);
    expect((await leadRow("p1"))?.notes).toBe("Nota dopo la migrazione");
  });

  it("un lead già Chiuso senza dati del vinto accetta una modifica che non cambia fase", async () => {
    const cookie = await authed();
    await insertLead("p2", { stage_id: "chiuso", next_action: null, next_action_at: null });
    const res = await call("/api/leads/p2", { method: "PATCH", json: { stageId: "chiuso", notes: "Cliente contento" } }, cookie);
    expect(res.status).toBe(200);
  });

  it("un lostReason null esplicito su una fase persa non tiene il motivo vecchio", async () => {
    const cookie = await authed();
    await insertLead("n1", { lost_reason: "budget" });
    const res = await call("/api/leads/n1", { method: "PATCH", json: { stageId: "non-chiuso", lostReason: null } }, cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("Scegli il motivo");
    expect((await leadRow("n1"))?.stage_id).toBe("da-richiamare");
  });

  it("la creazione rifiuta i dati del vinto e il motivo", async () => {
    const cookie = await authed();
    const res = await call("/api/leads", { method: "POST", json: { company: "Officina Nuova", setupCents: 100_000 } }, cookie);
    expect(res.status).toBe(400);
  });
});
