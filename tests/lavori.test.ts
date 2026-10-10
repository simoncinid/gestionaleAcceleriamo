import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LAVORI, giro } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { generaRicorrenti } from "../worker/lavori/service";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma, partiRoma } from "../worker/lib/roma";
import { authed, call } from "./helpers";

const MODELLO = "lt-automazione-su-misura";

async function cliente(id: string) {
  await env.DB.prepare("INSERT INTO clients (id, name, scope, created_at) VALUES (?, ?, 'acceleriamo', ?)").bind(id, `Cliente ${id}`, 1).run();
}
const conta = async (sql: string) => ((await env.DB.prepare(sql).first()) as { n: number }).n;

describe("lavori tipo", () => {
  it("la migrazione crea Automazione su misura con cinque una tantum e due ricorrenti", async () => {
    const cookie = await authed();
    const r = (await (await call("/api/job-templates", {}, cookie)).json()) as { modelli: { id: string; kind: string; tasks: { title: string; recurrence: string; dueDays: number | null; monthDay: number | null }[] }[] };
    const m = r.modelli.find((x) => x.id === MODELLO)!;
    expect(m.kind).toBe("una_tantum_ricorrente");
    expect(m.tasks.filter((t) => t.recurrence === "una_tantum").map((t) => t.dueDays)).toEqual([3, 7, 30, 40, 45]);
    expect(m.tasks.filter((t) => t.recurrence === "ricorrente").map((t) => t.monthDay)).toEqual([1, 1]);
  });
  it("un lavoro tipo una tantum rifiuta le task ricorrenti e il giorno del mese oltre 28", async () => {
    const cookie = await authed();
    const a = await call("/api/job-templates", { method: "POST", json: { name: "X", kind: "una_tantum", tasks: [{ title: "t", recurrence: "ricorrente", monthDay: 1 }] } }, cookie);
    expect(a.status).toBe(400);
    const b = await call("/api/job-templates", { method: "POST", json: { name: "X", kind: "ricorrente", tasks: [{ title: "t", recurrence: "ricorrente", monthDay: 29 }] } }, cookie);
    expect(b.status).toBe(400);
  });
  it("salvare di nuovo il modello tiene gli id delle task che esistono già", async () => {
    const cookie = await authed();
    const id = ((await (await call("/api/job-templates", { method: "POST", json: { name: "Mensile", kind: "ricorrente", tasks: [{ title: "Fattura", recurrence: "ricorrente", monthDay: 2 }] } }, cookie)).json()) as { id: string }).id;
    const prima = ((await (await call("/api/job-templates", {}, cookie)).json()) as { modelli: { id: string; tasks: { id: string }[] }[] }).modelli.find((m) => m.id === id)!.tasks[0].id;
    await call(`/api/job-templates/${id}`, { method: "PUT", json: { name: "Mensile", kind: "ricorrente", tasks: [{ id: prima, title: "Fattura del mese", recurrence: "ricorrente", monthDay: 3 }] } }, cookie);
    const dopo = ((await (await call("/api/job-templates", {}, cookie)).json()) as { modelli: { id: string; tasks: { id: string; title: string }[] }[] }).modelli.find((m) => m.id === id)!.tasks;
    expect(dopo).toHaveLength(1);
    expect(dopo[0].id).toBe(prima);
    expect(dopo[0].title).toBe("Fattura del mese");
  });
});

describe("lavori e task", () => {
  it("assegnare un lavoro genera le cinque task una tantum con la scadenza e le ricorrenti partono dal mese dopo", async () => {
    const cookie = await authed();
    await cliente("c1");
    const avvio = daRoma(2026, 10, 12);
    const r = await call("/api/jobs", { method: "POST", json: { clientId: "c1", templateId: MODELLO, startAt: avvio, feeCents: 30000 } }, cookie);
    expect(r.status).toBe(201);
    const t = (await env.DB.prepare("SELECT title, due_at, assignee_id FROM tasks WHERE client_id = 'c1' ORDER BY due_at").all()).results as { title: string; due_at: number; assignee_id: string }[];
    expect(t.map((x) => x.title)).toEqual(["Onboarding", "Raccolta requisiti", "Sviluppo della soluzione", "Collaudo con il cliente", "Messa in produzione"]);
    expect(t[0].due_at).toBe(daRoma(2026, 10, 15));
    expect(t[0].assignee_id).toBe("tommaso");
    expect(await env.DB.prepare("SELECT recurring_from_month m FROM jobs WHERE client_id = 'c1'").first()).toEqual({ m: "2026-11" });
    expect(await conta("SELECT count(*) n FROM fees WHERE client_id = 'c1'")).toBe(1);
  });
  it("dal lead vinto senza cliente nasce il cliente, il lavoro e i documenti restano sul lead", async () => {
    const cookie = await authed();
    await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('l1','Officina Rossi','manuale','chiuso',1,1,1)").run();
    const r = await call("/api/jobs", { method: "POST", json: { leadId: "l1", templateId: MODELLO, startAt: daRoma(2026, 11, 1), documenti: [{ name: "Contratto", url: "https://example.com/c" }] } }, cookie);
    expect(r.status).toBe(201);
    expect(await conta("SELECT count(*) n FROM clients WHERE origin_lead_id = 'l1'")).toBe(1);
    expect(await conta("SELECT count(*) n FROM documents WHERE lead_id = 'l1'")).toBe(1);
    expect(await conta("SELECT count(*) n FROM tasks")).toBe(5);
    // Un secondo lavoro dallo stesso lead non duplica il cliente.
    await call("/api/jobs", { method: "POST", json: { leadId: "l1", templateId: MODELLO, startAt: daRoma(2026, 11, 1) } }, cookie);
    expect(await conta("SELECT count(*) n FROM clients WHERE origin_lead_id = 'l1'")).toBe(1);
  });
  it("fatta si segna con chi e quando e si annulla", async () => {
    const cookie = await authed();
    const id = ((await (await call("/api/tasks", { method: "POST", json: { title: "Chiama il cliente", dueAt: 1 } }, cookie)).json()) as { id: string }).id;
    await call(`/api/tasks/${id}/fatta`, { method: "POST" }, cookie);
    expect(await env.DB.prepare("SELECT done_by b FROM tasks WHERE id = ?").bind(id).first()).toEqual({ b: "tommaso" });
    expect(((await (await call("/api/tasks", {}, cookie)).json()) as { task: unknown[] }).task).toHaveLength(0);
    await call(`/api/tasks/${id}/fatta`, { method: "DELETE" }, cookie);
    expect(await env.DB.prepare("SELECT done_at a, done_by b FROM tasks WHERE id = ?").bind(id).first()).toEqual({ a: null, b: null });
  });
});

describe("task ricorrenti del giro", () => {
  async function lavoroAttivo(clientId: string, daMese: string) {
    await cliente(clientId);
    await env.DB.prepare("INSERT INTO jobs (id, client_id, template_id, name, start_at, recurring_from_month, status, created_at) VALUES (?, ?, ?, 'Automazione su misura', 1, ?, 'attivo', 1)").bind(`j-${clientId}`, clientId, MODELLO, daMese).run();
  }
  it("crea una sola task per mese e per modello, dal giorno indicato", async () => {
    await lavoroAttivo("c2", "2026-11");
    const db = getDb(env.DB);
    expect(await generaRicorrenti(db, daRoma(2026, 10, 31, 7), 12)).toBe(0); // prima del mese di inizio
    expect(await generaRicorrenti(db, daRoma(2026, 11, 1, 7), 12)).toBe(2);
    expect(await generaRicorrenti(db, daRoma(2026, 11, 1, 7, 30), 12)).toBe(0); // secondo giro: niente doppioni
    expect(await generaRicorrenti(db, daRoma(2026, 12, 1, 7), 12)).toBe(2);
    expect(await conta("SELECT count(*) n FROM tasks WHERE client_id = 'c2'")).toBe(4);
  });
  it("misura con contaD1: 2 query fisse più una a task, come dichiara LAVORI.lavori", async () => {
    for (let i = 0; i < 8; i++) await lavoroAttivo(`q${i}`, "2026-11");
    const def = LAVORI.lavori!;
    const c = { query: 0 };
    const fatte = await generaRicorrenti(getDb(contaD1(env.DB, c)), daRoma(2026, 11, 3, 7), def.max);
    expect(fatte).toBe(def.max);
    expect(c.query).toBe(def.fisse + fatte * def.perUnita);
    expect(def.sottoPerUnita).toBe(0);
  });
  it("il giro con le task ricorrenti sta sotto il tetto di query D1 e riprende al giro delle 7:30", async () => {
    for (let i = 0; i < 8; i++) await lavoroAttivo(`m${i}`, "2026-11");
    let n = 0;
    const db = new Proxy(env.DB, { get(t, k) { if (k === "prepare") return (q: string) => { n++; return t.prepare(q); }; const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } });
    const adesso = daRoma(2026, 11, 3, 7);
    const esito = await giro({ ...env, DB: db } as typeof env, adesso);
    expect(esito.errori).toEqual([]);
    expect(esito.fatti).toContain("lavori");
    expect(await conta("SELECT count(*) n FROM tasks")).toBe(LAVORI.lavori!.max);
    expect(n).toBeLessThanOrEqual(45);
    expect(esito.query).toBeLessThanOrEqual(45);
    await giro(env, daRoma(2026, 11, 3, 7, 30));
    expect(await conta("SELECT count(*) n FROM tasks")).toBe(16);
  });
  it("il lavoro programmato occupa 7:00 e 7:30 di Roma", () => {
    const q = (t: number) => LAVORI.lavori!.quando(partiRoma(t));
    expect(q(daRoma(2026, 11, 3, 7, 0))).toBe(true);
    expect(q(daRoma(2026, 11, 3, 7, 30))).toBe(true);
    expect(q(daRoma(2026, 11, 3, 7, 5))).toBe(false);
  });
});

describe("passaggi dell'automazione", () => {
  it("l'elenco si scrive intero, tiene gli id, riordina e toglie", async () => {
    const cookie = await authed();
    await cliente("c9");
    await env.DB.prepare("INSERT INTO automations (id, client_id, name, status, created_at, updated_at) VALUES ('a9','c9','Gestione lead','attiva',1,1)").run();
    const put = (passi: unknown[]) => call("/api/automations/a9/steps", { method: "PUT", json: { passi } }, cookie);
    expect((await put([{ title: "Uno", summary: "Primo" }, { title: "Due", summary: "Secondo", branch: "Se serve", confirmed: true }])).status).toBe(200);
    const letti = async () => ((await (await call("/api/automations/a9/steps", {}, cookie)).json()) as { passi: { id: string; title: string; branch: string | null; confirmed: boolean }[] }).passi;
    const [uno, due] = await letti();
    expect(due.branch).toBe("Se serve");
    await put([{ id: due.id, title: "Due", summary: "Secondo" }, { id: uno.id, title: "Uno" }]);
    const dopo = await letti();
    expect(dopo.map((p) => p.title)).toEqual(["Due", "Uno"]);
    expect(dopo.map((p) => p.id)).toEqual([due.id, uno.id]);
    await put([]);
    expect(await letti()).toEqual([]);
    const lista = ((await (await call("/api/automations", {}, cookie)).json()) as { automazioni: { passaggi: number }[] }).automazioni;
    expect(lista[0].passaggi).toBe(0);
  });
});
