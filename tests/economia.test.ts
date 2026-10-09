import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authed, call } from "./helpers";

const G = 86_400_000;
const json = async <T,>(r: Response) => (await r.json()) as T;

// Fixture finte: un cliente nel perimetro e uno fuori, con canoni, fatture e lead.
async function semina() {
  const now = Date.now();
  const q = (s: string, ...b: unknown[]) => env.DB.prepare(s).bind(...b).run();
  await q("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('l1', 'Officina Prova', 'manuale', 'chiuso', ?1, ?1, ?1)", now);
  await q("INSERT INTO clients (id, name, sector, city, scope, origin_lead_id, created_at) VALUES ('c1', 'Officina Prova', 'un''officina meccanica', 'Pisa', 'acceleriamo', 'l1', ?1)", now);
  await q("INSERT INTO clients (id, name, sector, city, scope, created_at) VALUES ('c2', 'Studio Prova', 'uno studio', 'Lucca', 'fuori_perimetro', ?1)", now);
  await q("INSERT INTO fees (id, client_id, amount_cents, billing_day, status, start_at) VALUES ('f1', 'c1', 30000, 1, 'attivo', ?1)", now - 60 * G);
  await q("INSERT INTO fees (id, client_id, amount_cents, billing_day, status, start_at) VALUES ('f2', 'c2', 50000, 1, 'attivo', ?1)", now - 60 * G);
  await q("INSERT INTO invoices (id, client_id, kind, number, amount_cents, issued_at, due_at) VALUES ('i1', 'c1', 'canone', '7/2026', 30000, ?1, ?2)", now - 20 * G, now - 5 * G);
  await q("INSERT INTO invoices (id, client_id, kind, number, amount_cents, issued_at, due_at, paid_at) VALUES ('i2', 'c1', 'saldo', '8/2026', 150000, ?1, ?2, ?3)", now - 2 * G, now + 13 * G, now - 60_000);
  await q("INSERT INTO invoices (id, client_id, kind, amount_cents, issued_at, due_at) VALUES ('i3', 'c2', 'canone', 50000, ?1, ?2)", now - 20 * G, now - 5 * G);
  await q("INSERT INTO invoices (id, client_id, kind, amount_cents) VALUES ('i4', 'c1', 'extra', 10000)");
  return now;
}

describe("Economia, Clienti, Automazioni: accesso", () => {
  it("serve la sessione", async () => {
    for (const p of ["/api/economia/cruscotto", "/api/economia/fatture", "/api/clients", "/api/automations"]) expect((await call(p)).status).toBe(401);
  });
});

describe("Economia", () => {
  it("cruscotto: ricorrente dai soli canoni attivi nel perimetro, setup a parte, da incassare, in ritardo", async () => {
    const cookie = await authed();
    await semina();
    const d = await json<{ ricorrenteCents: number; obiettivoCents: number; setupMeseCents: number; daIncassareCents: number; inRitardo: { id: string }[] }>(await call("/api/economia/cruscotto", {}, cookie));
    expect(d).toMatchObject({ ricorrenteCents: 30000, obiettivoCents: 200000, setupMeseCents: 150000, daIncassareCents: 30000 });
    expect(d.inRitardo.map((f) => f.id)).toEqual(["i1"]);
  });

  it("fatture: stato calcolato, il cliente fuori perimetro non compare", async () => {
    const cookie = await authed();
    await semina();
    const { fatture } = await json<{ fatture: { id: string; stato: string }[] }>(await call("/api/economia/fatture", {}, cookie));
    expect(Object.fromEntries(fatture.map((f) => [f.id, f.stato]))).toEqual({ i1: "in_ritardo", i2: "incassata", i4: "da_emettere" });
  });

  it("Segna emessa chiede il numero e mette la scadenza a 15 giorni", async () => {
    const cookie = await authed();
    const now = await semina();
    expect((await call("/api/economia/fatture/i4/emessa", { method: "POST", json: { number: "", issuedAt: now } }, cookie)).status).toBe(400);
    expect((await call("/api/economia/fatture/i4/emessa", { method: "POST", json: { number: "9/2026", issuedAt: now } }, cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT number, due_at FROM invoices WHERE id = 'i4'").first()).toEqual({ number: "9/2026", due_at: now + 15 * G });
  });

  it("Segna incassata chiede la data, rifiuta il futuro, e la fattura esce dal ritardo", async () => {
    const cookie = await authed();
    const now = await semina();
    const futuro = await call("/api/economia/fatture/i1/incassata", { method: "POST", json: { paidAt: now + 3 * G } }, cookie);
    expect(futuro.status).toBe(422);
    expect((await json<{ error: string }>(futuro)).error).toBe("La data di incasso non può essere nel futuro");
    expect((await call("/api/economia/fatture/i4/incassata", { method: "POST", json: { paidAt: now } }, cookie)).status).toBe(409);
    expect((await call("/api/economia/fatture/i1/incassata", { method: "POST", json: { paidAt: now - G } }, cookie)).status).toBe(200);
    const d = await json<{ inRitardo: unknown[] }>(await call("/api/economia/cruscotto", {}, cookie));
    expect(d.inRitardo).toEqual([]);
  });

  it("canoni: pausa, seconda pausa rifiutata, ripresa, cessazione; mai per un cliente fuori perimetro", async () => {
    const cookie = await authed();
    await semina();
    const stato = (azione: string) => call("/api/economia/canoni/f1/stato", { method: "POST", json: { azione } }, cookie);
    expect((await stato("pausa")).status).toBe(200);
    const doppia = await stato("pausa");
    expect(doppia.status).toBe(409);
    expect((await json<{ error: string }>(doppia)).error).toBe("Il canone è in pausa: non si può mettere in pausa");
    expect((await stato("riprendi")).status).toBe(200);
    expect((await stato("cessa")).status).toBe(200);
    expect(await env.DB.prepare("SELECT status, paused_at FROM fees WHERE id = 'f1'").first()).toEqual({ status: "cessato", paused_at: null });
    const fuori = await call("/api/economia/canoni", { method: "POST", json: { clientId: "c2", amountCents: 20000, billingDay: 1 } }, cookie);
    expect(fuori.status).toBe(422);
    const { canoni } = await json<{ canoni: { id: string }[] }>(await call("/api/economia/canoni", {}, cookie));
    expect(canoni.map((c) => c.id)).toEqual(["f1"]);
  });

  it("costi: il mese viene dalla data di Roma, quelli di un cliente fuori perimetro non si vedono", async () => {
    const cookie = await authed();
    const now = await semina();
    for (const clientId of ["c1", "c2", null]) {
      expect((await call("/api/economia/costi", { method: "POST", json: { date: now, category: "strumenti", amountCents: 5000, clientId, note: "Prova" } }, cookie)).status).toBe(201);
    }
    const { mesi } = await json<{ mesi: { mese: string; totaleCents: number; costi: unknown[] }[] }>(await call("/api/economia/costi", {}, cookie));
    expect(mesi[0]).toMatchObject({ totaleCents: 10000 });
    expect(mesi[0].costi).toHaveLength(2);
  });
});

describe("Clienti", () => {
  it("elenco con stato calcolato e perimetro; scheda con canoni, fatture e lead di origine", async () => {
    const cookie = await authed();
    await semina();
    const { clienti } = await json<{ clienti: { id: string; stato: string; scope: string; canoneCents: number }[] }>(await call("/api/clients", {}, cookie));
    expect(clienti.find((c) => c.id === "c1")).toMatchObject({ stato: "attivo", scope: "acceleriamo", canoneCents: 30000 });
    expect(clienti.find((c) => c.id === "c2")).toMatchObject({ scope: "fuori_perimetro" });
    const s = await json<{ canoni: unknown[]; fatture: unknown[]; lead: { id: string; company: string } | null }>(await call("/api/clients/c1", {}, cookie));
    expect(s.canoni).toHaveLength(1);
    expect(s.fatture).toHaveLength(3);
    expect(s.lead).toEqual({ id: "l1", company: "Officina Prova" });
  });

  it("nuovo cliente e modifica sul posto", async () => {
    const cookie = await authed();
    const r = await call("/api/clients", { method: "POST", json: { name: "Agenzia Prova", sector: "un'agenzia immobiliare", city: "Pisa" } }, cookie);
    expect(r.status).toBe(201);
    const { cliente } = await json<{ cliente: { id: string; scope: string } }>(r);
    expect(cliente.scope).toBe("acceleriamo");
    expect((await call(`/api/clients/${cliente.id}`, { method: "PATCH", json: { city: "Lucca" } }, cookie)).status).toBe(200);
    expect((await call(`/api/clients/${cliente.id}`, { method: "PATCH", json: { name: " " } }, cookie)).status).toBe(400);
  });
});

describe("Automazioni", () => {
  it("nasce in costruzione, Segna attiva una volta sola, totali del pannello", async () => {
    const cookie = await authed();
    await semina();
    const r = await call("/api/automations", { method: "POST", json: { clientId: "c1", name: "Ordini da WhatsApp", family: "documenti", monthlyCostCents: 2000, promisedAt: Date.now() + 10 * G } }, cookie);
    expect(r.status).toBe(201);
    const { automazione } = await json<{ automazione: { id: string; status: string } }>(r);
    expect(automazione.status).toBe("in_costruzione");
    expect((await call(`/api/automations/${automazione.id}/attiva`, { method: "POST" }, cookie)).status).toBe(200);
    expect((await call(`/api/automations/${automazione.id}/attiva`, { method: "POST" }, cookie)).status).toBe(409);
    const p = await json<{ automazioni: { cliente: string; scope: string }[]; totali: { attive: number; inCostruzione: number; costiViviCents: number } }>(await call("/api/automations", {}, cookie));
    expect(p.totali).toEqual({ attive: 1, inCostruzione: 0, costiViviCents: 2000 });
    expect(p.automazioni[0]).toMatchObject({ cliente: "Officina Prova", scope: "acceleriamo" });
    expect((await call(`/api/automations/${automazione.id}`, { method: "PATCH", json: { clientId: "nessuno" } }, cookie)).status).toBe(404);
  });

  it("famiglia fuori dalle cinque: 400", async () => {
    const cookie = await authed();
    await semina();
    expect((await call("/api/automations", { method: "POST", json: { clientId: "c1", name: "Prova", family: "magia" } }, cookie)).status).toBe(400);
  });
});
