import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { CollegamentiScheda } from "../worker/leads/collegamenti";
import type { RigaContatto } from "../worker/leads/collegamenti-tipi";
import { authed, call } from "./helpers";

// Blocco 1, modifica 13: GET /api/leads/:id/collegamenti e GET /api/calls/:id.
let cookie = "";
const q = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

beforeEach(async () => {
  cookie = await authed();
  await q("INSERT INTO leads (id, company, stage_id, stage_changed_at, created_at, updated_at, source) VALUES ('L1', 'Officina Prova', 'chiuso', 5, 0, 0, 'manuale'), ('L2', 'Solo Lead', 'appuntamento-confermato', 0, 0, 0, 'manuale')");
  await q("INSERT INTO proposals (id, lead_id, number, status, registered_via, setup_cents, fee_cents, created_at, updated_at) VALUES ('P1', 'L1', 'ACC-2026-001', 'accettata', 'manuale', 200000, 30000, 10, 10)");
  await q("INSERT INTO calls (id, lead_id, kind, scheduled_at, outcome, created_at, updated_at) VALUES ('K1', 'L1', 'conoscenza', 100, 'fatta', 0, 0), ('K2', 'L2', 'conoscenza', 200, NULL, 0, 0)");
  await q("INSERT INTO clients (id, name, origin_lead_id, created_at) VALUES ('C1', 'Officina Prova Srl', 'L1', 50)");
  await q("INSERT INTO automations (id, client_id, name, status, created_at, updated_at) VALUES ('A1', 'C1', 'Ordini', 'attiva', 60, 60)");
  await q("INSERT INTO fees (id, client_id, automation_id, amount_cents, billing_day, status) VALUES ('F1', 'C1', 'A1', 30000, 1, 'attivo')");
});

describe("collegamenti del lead", () => {
  it("dal lead al cliente: proposte, call, cliente, automazioni e canoni", async () => {
    const r = await call("/api/leads/L1/collegamenti", {}, cookie);
    expect(r.status).toBe(200);
    const c = (await r.json()) as CollegamentiScheda;
    expect(c.proposte).toEqual([{ id: "P1", number: "ACC-2026-001", status: "accettata", data: 10, setupCents: 200000, feeCents: 30000 }]);
    expect(c.call).toEqual([{ id: "K1", kind: "conoscenza", scheduledAt: 100, outcome: "fatta" }]);
    expect(c.cliente).toEqual({ id: "C1", name: "Officina Prova Srl", dal: 50 });
    expect(c.automazioni).toEqual([{ id: "A1", name: "Ordini", status: "attiva", activatedAt: null }]);
    expect(c.canoni).toEqual([{ id: "F1", amountCents: 30000, status: "attivo", billingDay: 1, automationId: "A1", automationName: "Ordini" }]);
    expect(c.inviti).toEqual([]);
  });
  it("lead senza cliente: automazioni e canoni vuoti", async () => {
    const c = (await (await call("/api/leads/L2/collegamenti", {}, cookie)).json()) as CollegamentiScheda;
    expect(c.cliente).toBeNull();
    expect(c.automazioni).toEqual([]);
    expect(c.canoni).toEqual([]);
    expect(c.call).toHaveLength(1);
  });
  it("lead che non c'è: 404", async () => {
    expect((await call("/api/leads/NO/collegamenti", {}, cookie)).status).toBe(404);
  });
});

describe("dettaglio della call", () => {
  it("call con la riga del contatto: lead e cliente", async () => {
    const r = await call("/api/calls/K1", {}, cookie);
    expect(r.status).toBe(200);
    const d = (await r.json()) as { call: { id: string; company: string }; contatto: RigaContatto };
    expect(d.call.id).toBe("K1");
    expect(d.contatto).toEqual({ azienda: "Officina Prova", leadId: "L1", clienteId: "C1" });
  });
  it("call di un lead non cliente: clienteId null; call che non c'è: 404", async () => {
    const d = (await (await call("/api/calls/K2", {}, cookie)).json()) as { contatto: RigaContatto };
    expect(d.contatto.clienteId).toBeNull();
    expect((await call("/api/calls/NO", {}, cookie)).status).toBe(404);
  });
});
