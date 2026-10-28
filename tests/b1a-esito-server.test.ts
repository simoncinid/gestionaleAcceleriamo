import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

// Blocco 1, modifica 12 (parte worker): fase, azione e scadenza dell'esito le calcola il server con la transizione.
const NOW = Date.now();
const GIORNO = 86_400_000;
async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", contact_name: "Luca Prova", source: "manuale", stage_id: "da-chiamare-prima-volta", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, next_action: "Prima chiamata", next_action_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const leggi = (id: string) => env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Record<string, unknown>>();
const esito = (id: string, json: Record<string, unknown>, cookie: string) =>
  call(`/api/leads/${id}/esito`, { method: "PATCH", json: { requestId: crypto.randomUUID(), ...json } }, cookie);

describe("esito calcolato dal server", () => {
  it("il server ignora fase e data mandate dal foglio: non risponde in 10 porta in 20", async () => {
    const cookie = await authed();
    await insertLead("e1");
    const r = await esito("e1", { esito: "non_risponde", stageId: "in-attesa-decisione", nextAction: "Altro", nextActionAt: NOW + 99 * GIORNO }, cookie);
    expect(r.status).toBe(200);
    const l = await leggi("e1");
    expect(l).toMatchObject({ stage_id: "da-richiamare", next_action: "Richiamare", attempt_count: 1 });
    expect(l!.next_action_at).not.toBe(NOW + 99 * GIORNO);
  });

  it("richiamare con il giorno detto dal cliente: vince quel giorno", async () => {
    const cookie = await authed();
    await insertLead("e2");
    const giorno = NOW + 5 * GIORNO;
    expect((await esito("e2", { esito: "richiamare", data: giorno }, cookie)).status).toBe(200);
    expect(await leggi("e2")).toMatchObject({ stage_id: "da-richiamare", next_action: "Richiamare", next_action_at: giorno });
  });

  it("esito che non vale nella fase: 422 e niente scritto", async () => {
    const cookie = await authed();
    await insertLead("e3");
    const r = await esito("e3", { esito: "offerta_presentata" }, cookie);
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("Questo esito non vale in questa fase");
    await insertLead("e3b", { stage_id: "chiuso", next_action: null, next_action_at: null });
    expect((await esito("e3b", { esito: "risposto" }, cookie)).status).toBe(422);
    const n = await env.DB.prepare("SELECT count(*) n FROM activities WHERE lead_id IN ('e3','e3b')").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("consulenza fatta: in 40 con il preventivo entro 2 giorni lavorativi, responsabile della presentazione", async () => {
    const cookie = await authed();
    await insertLead("e4", { stage_id: "appuntamento-confermato", next_action: "Call di conoscenza", owner_id: null });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k4', 'e4', 'conoscenza', ?, ?, ?)").bind(NOW - 600_000, NOW, NOW).run();
    expect((await esito("e4", { esito: "conoscenza_fatta" }, cookie)).status).toBe(200);
    const l = await leggi("e4");
    expect(l).toMatchObject({ stage_id: "in-attesa-preventivo", next_action: "Preparare l'offerta", owner_id: "tommaso" });
    expect(l!.next_action_at as number).toBeGreaterThan(NOW);
    const c = await env.DB.prepare("SELECT outcome FROM calls WHERE id = 'k4'").first<{ outcome: string }>();
    expect(c!.outcome).toBe("fatta");
  });

  it("non interessato: motivo obbligatorio, poi 80 senza azione", async () => {
    const cookie = await authed();
    await insertLead("e5", { stage_id: "in-attesa-decisione", next_action: "Follow-up preventivo" });
    expect((await esito("e5", { esito: "non_interessato" }, cookie)).status).toBe(422);
    expect((await esito("e5", { esito: "non_interessato", lostReason: "concorrente" }, cookie)).status).toBe(200);
    expect(await leggi("e5")).toMatchObject({ stage_id: "non-chiuso", lost_reason: "concorrente", next_action: null, next_action_at: null });
  });
});

describe("fase scelta a mano", () => {
  it("solo stageId: azione e scadenza dalla transizione", async () => {
    const cookie = await authed();
    await insertLead("f1", { stage_id: "da-richiamare", next_action: "Richiamare" });
    const r = await call("/api/leads/f1", { method: "PATCH", json: { stageId: "in-attesa-decisione" } }, cookie);
    expect(r.status).toBe(200);
    const l = await leggi("f1");
    expect(l).toMatchObject({ stage_id: "in-attesa-decisione", next_action: "Follow-up preventivo" });
    expect(l!.next_action_at as number).toBeGreaterThan(NOW);
  });
});
