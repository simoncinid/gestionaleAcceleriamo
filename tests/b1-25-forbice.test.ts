import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

// Blocco 1, modifica 25: forbice di prezzo della proposta dell'offerta, due numeri in centesimi, nessun calcolo.
const NOW = Date.now();
async function insertLead(id: string) {
  await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES (?, ?, 'manuale', 'in-attesa-preventivo', ?, ?, ?)")
    .bind(id, `Officina ${id}`, NOW, NOW, NOW).run();
}
const crea = (cookie: string, extra: Record<string, unknown>) =>
  call("/api/proposals", { method: "POST", json: { leadId: "f", number: `OFF-${crypto.randomUUID().slice(0, 6)}`, status: "bozza", ...extra } }, cookie);

describe("forbice dell'offerta", () => {
  it("si scrive con la proposta e si rilegge", async () => {
    const cookie = await authed();
    await insertLead("f");
    const r = await crea(cookie, { forbiceDaCents: 300_000, forbiceACents: 500_000 });
    expect(r.status).toBe(201);
    const { proposta } = (await r.json()) as { proposta: { id: string } };
    const g = (await (await call(`/api/proposals/${proposta.id}`, {}, cookie)).json()) as { proposta: { forbiceDaCents: number; forbiceACents: number } };
    expect(g.proposta).toMatchObject({ forbiceDaCents: 300_000, forbiceACents: 500_000 });
    // Si cambia anche dopo.
    expect((await call(`/api/proposals/${proposta.id}`, { method: "PATCH", json: { forbiceDaCents: 250_000, forbiceACents: 450_000 } }, cookie)).status).toBe(200);
    expect(await env.DB.prepare("SELECT forbice_da_cents AS da, forbice_a_cents AS a FROM proposals WHERE id = ?").bind(proposta.id).first()).toEqual({ da: 250_000, a: 450_000 });
  });

  it("se c'è uno c'è l'altro, e da non supera a", async () => {
    const cookie = await authed();
    await insertLead("f");
    expect((await crea(cookie, { forbiceDaCents: 300_000 })).status).toBe(400);
    expect((await crea(cookie, { forbiceDaCents: 600_000, forbiceACents: 500_000 })).status).toBe(400);
    expect((await crea(cookie, { forbiceDaCents: 500_000, forbiceACents: 500_000 })).status).toBe(201);
  });
});

describe("forbice dal wiki (aggancio)", () => {
  const aggancio = (corpo: unknown) => call("/api/hooks/proposals", { method: "POST", json: corpo, headers: { authorization: "Bearer chiave-aggancio-test" } });
  const base = { numero: "OFF-2026-001", azienda: "Officina Forbice", opzione: "standard", stato: "draft", sourcePath: "x.md" };
  it("forbice_da e forbice_a in euro diventano centesimi; una sola è un errore", async () => {
    expect((await aggancio({ ...base, forbice_da: 3000, forbice_a: 5000 })).status).toBeLessThan(300);
    expect(await env.DB.prepare("SELECT forbice_da_cents AS da, forbice_a_cents AS a FROM proposals WHERE number = 'OFF-2026-001'").first()).toEqual({ da: 300_000, a: 500_000 });
    expect((await aggancio({ ...base, numero: "OFF-2026-002", forbice_da: 3000 })).status).toBe(400);
  });
});
