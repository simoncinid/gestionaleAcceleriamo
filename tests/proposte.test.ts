import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

const NOW = Date.now();
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: `Officina ${id}`, source: "manuale", stage_id: "in-attesa-preventivo", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

describe("API delle proposte", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/proposals")).status).toBe(401);
  });

  it("a mano, segna presentata, accettata con la proprietà del codice", async () => {
    const cookie = await authed();
    await insertLead("a");
    // Con le sequenze accese il motore avanza al passo 1 (spente, il passo non si muove): come nel test l5 delle call.
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('sequenze', '{\"attive\":true}', ?)").bind(NOW).run();
    const r = await call("/api/proposals", { method: "POST", json: { leadId: "a", number: "ACC-2026-020", option: "standard", setupCents: 200_000, feeCents: 15_000, hoursEstimate: 40, alternativeCents: 1_400_000, validUntil: NOW + 30 * 86_400_000, status: "registrata" } }, cookie);
    expect(r.status).toBe(201);
    const { proposta } = (await r.json()) as { proposta: { id: string } };
    expect((await call("/api/proposals", { method: "POST", json: { leadId: "a", number: "ACC-2026-020", status: "bozza" } }, cookie)).status).toBe(422);

    await call(`/api/proposals/${proposta.id}`, { method: "PATCH", json: { status: "presentata" } }, cookie);
    expect(await env.DB.prepare("SELECT stage_id, next_action, sequence_step FROM leads WHERE id = 'a'").first()).toEqual({ stage_id: "in-attesa-decisione", next_action: "Follow-up preventivo", sequence_step: 1 });

    await call(`/api/proposals/${proposta.id}`, { method: "PATCH", json: { status: "accettata", option: "proprieta" } }, cookie);
    expect(await env.DB.prepare("SELECT setup_cents, fee_cents FROM leads WHERE id = 'a'").first()).toEqual({ setup_cents: 1_400_000, fee_cents: null });
    expect(await env.DB.prepare("SELECT status, decided_at IS NOT NULL d FROM proposals WHERE id = ?").bind(proposta.id).first()).toEqual({ status: "accettata", d: 1 });
  });

  it("abbina una proposta arrivata senza lead", async () => {
    const cookie = await authed();
    await insertLead("b");
    await env.DB.prepare("INSERT INTO proposals (id, number, company, status, registered_via, created_at, updated_at) VALUES ('p', 'ACC-2026-030', 'Officina b', 'registrata', 'aggancio', ?, ?)").bind(NOW, NOW).run();
    expect((await call("/api/proposals/p/abbina", { method: "POST", json: { leadId: "b" } }, cookie)).status).toBe(200);
    const elenco = (await (await call("/api/leads/b/proposals", {}, cookie)).json()) as { proposte: { number: string }[] };
    expect(elenco.proposte.map((p) => p.number)).toEqual(["ACC-2026-030"]);
  });

  it("dettaglio con le date dei ricontatti a 3, 7 e 14 giorni", async () => {
    const cookie = await authed();
    await insertLead("c");
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, status, registered_via, presented_at, created_at, updated_at) VALUES ('q', 'c', 'ACC-2026-040', 'presentata', 'manuale', ?, ?, ?)").bind(NOW, NOW, NOW).run();
    const d = (await (await call("/api/proposals/q", {}, cookie)).json()) as { ricontatti: number[] };
    expect(d.ricontatti).toHaveLength(3);
    expect(d.ricontatti[0]).toBeGreaterThan(NOW + 2 * 86_400_000);
    expect(d.ricontatti[2]).toBeGreaterThan(NOW + 13 * 86_400_000);
  });
});
