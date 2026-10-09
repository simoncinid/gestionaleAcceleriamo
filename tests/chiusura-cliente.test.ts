import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

type Dettaglio = { lead: { id: string; stageId: string }; cliente: { id: string; name: string } | null; activities: { type: string; body: string }[] };

const chiusura = { stageId: "chiuso", setupCents: 250_000, feeCents: 30_000, wonStartAt: 1_900_000_000_000 };

async function nuovoLead(cookie: string, company: string) {
  const res = await call("/api/leads", { method: "POST", json: { company } }, cookie);
  return ((await res.json()) as { lead: { id: string } }).lead.id;
}

describe("chiusura vinta: nasce il cliente", () => {
  it("crea cliente e canone in attesa, e il dettaglio del lead lo espone", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Ferri Srl");
    const res = await call(`/api/leads/${id}`, { method: "PATCH", json: { ...chiusura, clientName: "Ferri Impianti" } }, cookie);
    expect(res.status).toBe(200);
    const d = (await (await call(`/api/leads/${id}`, {}, cookie)).json()) as Dettaglio;
    expect(d.cliente?.name).toBe("Ferri Impianti");
    const cliente = await env.DB.prepare("SELECT id, scope, origin_lead_id FROM clients WHERE origin_lead_id = ?").bind(id).first<{ id: string; scope: string }>();
    expect(cliente?.scope).toBe("acceleriamo");
    const canone = await env.DB.prepare("SELECT amount_cents, status, start_at FROM fees WHERE client_id = ?").bind(cliente!.id).first<{ amount_cents: number; status: string; start_at: number }>();
    expect(canone).toEqual({ amount_cents: 30_000, status: "in_attesa", start_at: 1_900_000_000_000 });
    expect(d.activities.some((a) => a.body === "Cliente creato: Ferri Impianti")).toBe(true);
  });

  it("senza nome usa l'azienda; una seconda chiusura non duplica il cliente", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Gialli Spa");
    await call(`/api/leads/${id}`, { method: "PATCH", json: chiusura }, cookie);
    const riapri = await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "da-chiamare-prima-volta", nextAction: "Richiamare", nextActionAt: 1_900_000_000_000 } }, cookie);
    expect(riapri.status).toBe(200);
    await call(`/api/leads/${id}`, { method: "PATCH", json: chiusura }, cookie);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(name) AS nome FROM clients WHERE origin_lead_id = ?").bind(id).first<{ n: number; nome: string }>();
    expect(n).toEqual({ n: 1, nome: "Gialli Spa" });
  });

  it("canone a zero: cliente sì, canone no", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Zero Srl");
    await call(`/api/leads/${id}`, { method: "PATCH", json: { ...chiusura, feeCents: 0 } }, cookie);
    const c = await env.DB.prepare("SELECT id FROM clients WHERE origin_lead_id = ?").bind(id).first<{ id: string }>();
    expect(c).not.toBeNull();
    const f = await env.DB.prepare("SELECT COUNT(*) AS n FROM fees WHERE client_id = ?").bind(c!.id).first<{ n: number }>();
    expect(f?.n).toBe(0);
  });

  it("un lead aperto non ha cliente", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Aperto Srl");
    const d = (await (await call(`/api/leads/${id}`, {}, cookie)).json()) as Dettaglio;
    expect(d.cliente).toBeNull();
  });
});
