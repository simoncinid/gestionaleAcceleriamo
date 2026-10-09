import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { call } from "./helpers";

const NOW = Date.now();
const CHIAVE = "chiave-aggancio-test";
async function insertLead(id: string, company: string, extra: Record<string, unknown> = {}) {
  const row = { id, company, source: "manuale", stage_id: "in-attesa-preventivo", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const aggancio = (corpo: unknown, chiave = CHIAVE) =>
  call("/api/hooks/proposals", { method: "POST", json: corpo, headers: { authorization: `Bearer ${chiave}` } });
const base = { numero: "ACC-2026-014", azienda: "Officina Meccanica Bertini", opzione: "standard", setup: 2000, canone: 150, ore: 40, validita: "2026-11-08", stato: "sent", sourcePath: "companies/acceleriamo/documents/2026/quotation/2026-10-10-quotation-bertini.md" };
const proposta = (numero: string) => env.DB.prepare("SELECT * FROM proposals WHERE number = ?").bind(numero).first<Record<string, unknown>>();
const lead = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();

describe("aggancio dal wiki", () => {
  it("chiave sbagliata o assente: 401, niente scritto", async () => {
    expect((await aggancio(base, "sbagliata")).status).toBe(401);
    expect((await call("/api/hooks/proposals", { method: "POST", json: base })).status).toBe(401);
    expect(await proposta("ACC-2026-014")).toBeNull();
  });

  it("nome con forma societaria e maiuscole diverse: abbinata al lead aperto", async () => {
    await insertLead("bertini", "OFFICINA MECCANICA BERTINI S.r.l.");
    const r = await aggancio(base);
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ numero: "ACC-2026-014", versione: 1, stato: "abbinata" });
    expect(await proposta("ACC-2026-014")).toMatchObject({ lead_id: "bertini", status: "registrata", setup_cents: 200_000, fee_cents: 15_000, hours_estimate: 40, registered_via: "aggancio" });
    expect(await lead("bertini")).toMatchObject({ next_action: "Fissare la call di presentazione", setup_cents: 200_000, fee_cents: 15_000 });
    const storico = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'bertini' AND type = 'proposta'").first<{ body: string }>();
    expect(storico?.body).toBe("Preventivo ACC-2026-014 registrato dal wiki");
  });

  it("due lead con lo stesso nome: da abbinare, nessun lead toccato", async () => {
    await insertLead("b1", "Officina Meccanica Bertini");
    await insertLead("b2", "Officina Meccanica Bertini snc");
    expect(await (await aggancio(base)).json()).toMatchObject({ stato: "da_abbinare" });
    expect(await proposta("ACC-2026-014")).toMatchObject({ lead_id: null, company: "Officina Meccanica Bertini" });
  });

  it("il lead per id vince sul nome; un lead chiuso non si abbina per nome", async () => {
    await insertLead("perso", "Officina Meccanica Bertini", { stage_id: "fake" });
    await insertLead("giusto", "Tutt'altro nome");
    expect(await (await aggancio({ ...base, lead: "giusto" })).json()).toMatchObject({ stato: "abbinata" });
    expect((await proposta("ACC-2026-014"))?.lead_id).toBe("giusto");
    expect(await (await aggancio({ ...base, numero: "ACC-2026-015" })).json()).toMatchObject({ stato: "da_abbinare" });
  });

  it("numero ripetuto con un lead diverso: aggiorna la proposta, non sposta il lead, lo dice", async () => {
    await insertLead("primo", "Officina Meccanica Bertini");
    await insertLead("secondo", "Altra Officina");
    await aggancio({ ...base, lead: "primo" });
    const r = await aggancio({ ...base, lead: "secondo", setup: 2500 });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ versione: 2, stato: "abbinata", avviso: "Il numero ACC-2026-014 è già della proposta di Officina Meccanica Bertini: lead non cambiato" });
    expect(await proposta("ACC-2026-014")).toMatchObject({ lead_id: "primo", setup_cents: 250_000, version: 2 });
    expect((await env.DB.prepare("SELECT count(*) n FROM proposals").first<{ n: number }>())!.n).toBe(1);
  });

  it("bozza: si registra ma non fa partire regole; alla stampa in sent passa a registrata", async () => {
    await insertLead("bozza", "Officina Meccanica Bertini", { next_action: "Preparare il preventivo", next_action_at: NOW + 1000 });
    await aggancio({ ...base, stato: "draft" });
    expect(await proposta("ACC-2026-014")).toMatchObject({ status: "bozza", sent_at: null });
    expect(await lead("bozza")).toMatchObject({ next_action: "Preparare il preventivo" });
    await aggancio(base);
    expect(await proposta("ACC-2026-014")).toMatchObject({ status: "registrata", version: 2 });
    expect((await proposta("ACC-2026-014"))?.sent_at).not.toBeNull();
    expect(await lead("bozza")).toMatchObject({ next_action: "Fissare la call di presentazione" });
  });

  it("una presentazione già fissata: nessuna nuova azione", async () => {
    await insertLead("con-call", "Officina Meccanica Bertini", { stage_id: "presentazione-confermata", next_action: "Call di presentazione", next_action_at: NOW + 86_400_000 });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k', 'con-call', 'presentazione', ?, ?, ?)").bind(NOW + 86_400_000, NOW, NOW).run();
    await aggancio(base);
    expect(await lead("con-call")).toMatchObject({ next_action: "Call di presentazione" });
  });

  it("corpo non valido 400, corpo oltre 16 KB 413, oltre 30 chiamate l'ora 429", async () => {
    expect((await aggancio({ ...base, numero: "" })).status).toBe(400);
    expect((await aggancio({ ...base, sourcePath: "x".repeat(17_000) })).status).toBe(413);
    for (let i = 0; i < 28; i++) await env.DB.prepare("INSERT INTO hook_log (id, at, status) VALUES (?, ?, 200)").bind(`h${i}`, NOW - 1000).run();
    expect((await aggancio({ ...base, numero: "ACC-2026-099" })).status).toBe(429);
  });

  it("la chiave sbagliata non scrive nel registro, non consuma il limite e non dice cosa non va", async () => {
    for (let i = 0; i < 31; i++) expect((await aggancio(base, "chiave-aggancio-tesx")).status).toBe(401);
    const r = await aggancio(base, "chiave-aggancio-tesx");
    expect(await r.json()).toEqual({ error: "Chiave non valida" });
    expect((await call("/api/hooks/proposals", { method: "POST", json: base, headers: { authorization: "chiave-aggancio-test" } })).status).toBe(401);
    expect((await env.DB.prepare("SELECT count(*) n FROM hook_log").first<{ n: number }>())!.n).toBe(0);
    expect((await aggancio(base)).status).toBe(201);
    expect(await env.DB.prepare("SELECT status, number, outcome FROM hook_log").all().then((x) => x.results)).toEqual([{ status: 201, number: "ACC-2026-014", outcome: "da abbinare" }]);
  });

  it("stesso corpo mandato due volte: una sola proposta, la seconda risponde 200", async () => {
    await insertLead("doppio", "Officina Meccanica Bertini");
    expect((await aggancio(base)).status).toBe(201);
    expect((await aggancio(base)).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) n FROM proposals").first<{ n: number }>())!.n).toBe(1);
    expect(await proposta("ACC-2026-014")).toMatchObject({ lead_id: "doppio", status: "registrata" });
  });

  it("lead: che punta a un lead cestinato: la proposta resta da abbinare", async () => {
    await insertLead("cestinato", "Officina Meccanica Bertini", { deleted_at: NOW });
    const r = await aggancio({ ...base, lead: "cestinato" });
    expect(r.ok).toBe(true);
    expect(await r.json()).toMatchObject({ stato: "da_abbinare" });
    expect((await proposta("ACC-2026-014"))?.lead_id).toBeNull();
    expect(await lead("cestinato")).toMatchObject({ setup_cents: null, next_action: null });
  });

  it("proposta senza lead rimandata con lead: valido: abbinata con prezzo e prossima azione come da Abbina", async () => {
    await insertLead("dopo", "Nome che non combacia");
    expect(await (await aggancio(base)).json()).toMatchObject({ stato: "da_abbinare" });
    const r = await aggancio({ ...base, lead: "dopo" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ stato: "abbinata", versione: 2 });
    expect(await proposta("ACC-2026-014")).toMatchObject({ lead_id: "dopo", status: "registrata" });
    expect(await lead("dopo")).toMatchObject({ setup_cents: 200_000, fee_cents: 15_000, next_action: "Fissare la call di presentazione" });
  });

  it("link al PDF che non inizia con https:// rifiutato", async () => {
    const r = await aggancio({ ...base, link_pdf: "javascript:alert(1)" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Il link deve iniziare con https://" });
    expect((await aggancio({ ...base, link_pdf: "http://esempio.it/p.pdf" })).status).toBe(400);
    expect((await aggancio({ ...base, link_pdf: "https://esempio.it/p.pdf" })).status).toBe(201);
  });

  it("stato dell'integrazione: ok dopo una registrazione, errore con un corpo non valido", async () => {
    await aggancio(base);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'aggancio'").first()).toEqual({ ok: 1 });
    await aggancio({ ...base, stato: "boh" });
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'aggancio'").first()).toEqual({ ok: 0 });
  });

  it("il limite di 16 KB si controlla prima di leggere il JSON", async () => {
    const r = await call("/api/hooks/proposals", { method: "POST", body: "{" + " ".repeat(17_000), headers: { authorization: `Bearer ${CHIAVE}`, "content-type": "application/json" } });
    expect(r.status).toBe(413);
  });

  it("la riga lead: del frontmatter abbina per id (PV8)", async () => {
    await insertLead("id-dal-wiki", "Nome diverso srl");
    expect(await (await aggancio({ ...base, lead: "id-dal-wiki", azienda: "Officina Prova" })).json()).toMatchObject({ stato: "abbinata" });
    expect((await proposta("ACC-2026-014"))?.lead_id).toBe("id-dal-wiki");
  });
});
