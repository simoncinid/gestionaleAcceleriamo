import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { authed, call, createUser } from "./helpers";

// Blocco 1, modifica 6: il responsabile segue la fase (Diego da 10 a 30, Tommaso da 40 a 70) salvo se scelto a mano.
const NOW = Date.now();
const DOMANI = NOW + 86_400_000;
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", source: "manuale", stage_id: "appuntamento-confermato", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Call di conoscenza", next_action_at: NOW - 600_000, owner_id: "diego", ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const leggi = (id: string) => env.DB.prepare("SELECT owner_id, owner_manual, stage_id FROM leads WHERE id = ?").bind(id).first<{ owner_id: string | null; owner_manual: number; stage_id: string }>();

describe("responsabile per fase", () => {
  it("default delle Impostazioni: presentazione a Tommaso", () => {
    expect(IMPOSTAZIONI_DEFAULT.assegnazione).toMatchObject({ primaChiamata: "diego", presentazione: "tommaso" });
  });

  it("da 30 a 40 passa a Tommaso; cambiato a mano in Diego e portato a 50 resta Diego", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-1", "Diego");
    await insertLead("r1");
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('kr1', 'r1', 'conoscenza', ?, ?, ?)").bind(NOW - 600_000, NOW, NOW).run();
    await call("/api/calls/kr1", { method: "PATCH", json: { outcome: "fatta" } }, cookie);
    expect(await leggi("r1")).toMatchObject({ stage_id: "in-attesa-preventivo", owner_id: "tommaso", owner_manual: 0 });

    expect((await call("/api/leads/r1", { method: "PATCH", json: { ownerId: "diego" } }, cookie)).status).toBe(200);
    expect(await leggi("r1")).toMatchObject({ owner_id: "diego", owner_manual: 1 });

    const r = await call("/api/leads/r1/calls", { method: "POST", json: { kind: "presentazione", scheduledAt: DOMANI, meetLink: null, invito: false } }, cookie);
    expect(r.status).toBe(201);
    expect(await leggi("r1")).toMatchObject({ stage_id: "presentazione-confermata", owner_id: "diego", owner_manual: 1 });
  });

  it("anche la fase scelta a mano assegna il default della fase", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-1", "Diego");
    await insertLead("r2", { stage_id: "in-attesa-decisione", owner_id: "tommaso", next_action: "Follow-up", next_action_at: DOMANI });
    const r = await call("/api/leads/r2", { method: "PATCH", json: { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: DOMANI } }, cookie);
    expect(r.status).toBe(200);
    expect(await leggi("r2")).toMatchObject({ stage_id: "da-richiamare", owner_id: "diego" });
  });
});
