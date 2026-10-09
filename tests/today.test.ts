import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call, createUser } from "./helpers";
import type { Oggi } from "../worker/today/tipi";

const GIORNO = 86_400_000;
const NOW = Date.UTC(2026, 9, 13, 10, 0); // martedì 13 ottobre, 12:00 a Roma

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, next_action: "Richiamare", next_action_at: NOW + 10 * GIORNO, created_at: NOW - GIORNO, updated_at: NOW, owner_id: "tommaso", ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
const oggi = async (cookie: string, chi = "tutte") => (await (await call(`/api/today?chi=${chi}&now=${NOW}`, {}, cookie)).json()) as Oggi;

describe("GET /today", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/today")).status).toBe(401);
  });

  it("divide i lead nei gruppi della spec 6.4", async () => {
    const cookie = await authed();
    await insertLead("nuovo", { stage_id: "da-chiamare-prima-volta", next_action: "Prima chiamata", next_action_at: NOW - 30 * 60_000, created_at: NOW - 30 * 60_000 });
    await insertLead("scaduto", { next_action_at: NOW - GIORNO });
    await insertLead("stasera", { next_action_at: NOW + 5 * 3_600_000 });
    await insertLead("domani", { next_action_at: NOW + GIORNO });
    await insertLead("proposta", { stage_id: "in-attesa-decisione", next_action: "Follow-up preventivo", next_action_at: NOW - 1000 });
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, status, registered_via, created_at, updated_at) VALUES ('p1', 'proposta', 'ACC-2026-001', 'registrata', 'aggancio', ?, ?)").bind(NOW, NOW).run();
    await insertLead("fermo", { stage_changed_at: NOW - 9 * GIORNO });
    await insertLead("pausa", { stage_id: "probabilmente-bloccato", next_action: "Richiamare dopo la pausa", next_action_at: NOW - 1000, paused_until: null });
    await insertLead("chiuso", { stage_id: "chiuso", next_action_at: NOW - GIORNO });
    await insertLead("cestino", { next_action_at: NOW - GIORNO, deleted_at: NOW });
    await insertLead("con-call", { stage_id: "appuntamento-confermato" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'con-call', 'conoscenza', ?, ?, ?)").bind(NOW + 3_600_000, NOW, NOW).run();

    const o = await oggi(cookie);
    expect(o.nuovi.map((l) => l.id)).toEqual(["nuovo"]);
    expect(o.nuovi[0].slaScadenza).toBe(NOW + 90 * 60_000);
    expect(o.daFare.map((l) => l.id)).toEqual(["scaduto", "stasera"]);
    expect(o.proposte.map((p) => p.number)).toEqual(["ACC-2026-001"]);
    expect(o.finePausa.map((l) => l.id)).toEqual(["pausa"]);
    expect(o.fermi.map((l) => l.id)).toEqual(["fermo"]);
    expect(o.call.map((k) => k.id)).toEqual(["k1"]);
    expect(o.adesso).toMatchObject({ tipo: "lead", id: "scaduto" });
    expect(o.totale).toBe(1 + 2 + 1 + 1 + 1);
    expect(o.numeri.proposteAperte).toBe(1);
    expect(o.numeri.leadNuovi).toBe(1);
  });

  it("proposta registrata con il lead ancora in attesa del preventivo: una volta sola, nel blocco proposte con Segna presentata", async () => {
    const cookie = await authed();
    await insertLead("attesa", { stage_id: "in-attesa-preventivo", next_action: "Fissare la call di presentazione", next_action_at: NOW - 1000, stage_changed_at: NOW - 9 * GIORNO });
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, status, registered_via, created_at, updated_at) VALUES ('p1', 'attesa', 'ACC-2026-070', 'registrata', 'aggancio', ?, ?)").bind(NOW, NOW).run();
    const o = await oggi(cookie);
    expect(o.proposte.map((p) => [p.leadId, p.status])).toEqual([["attesa", "registrata"]]);
    expect(o.daFare).toEqual([]);
    expect(o.fermi).toEqual([]);
    expect(o.adesso).toBeNull();
    expect(o.totale).toBe(1);
  });

  it("Mie mostra i miei e quelli senza responsabile", async () => {
    const cookie = await authed();
    await createUser("diego", "password-lunga-2", "Diego");
    await insertLead("mio", { next_action_at: NOW - 1000 });
    await insertLead("libero", { next_action_at: NOW - 2000, owner_id: null });
    await insertLead("suo", { next_action_at: NOW - 3000, owner_id: "diego" });
    expect((await oggi(cookie, "mie")).daFare.map((l) => l.id).sort()).toEqual(["libero", "mio"]);
    expect((await oggi(cookie, "tutte")).daFare).toHaveLength(3);
  });

  it("call e proposte di lead cestinati non contano nei numeri", async () => {
    const cookie = await authed();
    await insertLead("vivo");
    await insertLead("cestinato", { deleted_at: NOW });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, created_at, updated_at) VALUES ('k1', 'vivo', 'conoscenza', ?, ?, ?), ('k2', 'cestinato', 'conoscenza', ?, ?, ?)")
      .bind(NOW + 3_600_000, NOW, NOW, NOW + 3_600_000, NOW, NOW).run();
    await env.DB.prepare("INSERT INTO proposals (id, lead_id, number, status, registered_via, created_at, updated_at) VALUES ('p1', 'vivo', 'ACC-2026-001', 'registrata', 'aggancio', ?, ?), ('p2', 'cestinato', 'ACC-2026-002', 'presentata', 'aggancio', ?, ?)")
      .bind(NOW, NOW, NOW, NOW).run();
    const o = await oggi(cookie);
    expect(o.numeri.callSettimana).toBe(1);
    expect(o.numeri.proposteAperte).toBe(1);
  });

  it("il giorno finisce a mezzanotte di Roma anche quando dura 25 ore (cambio d'ora)", async () => {
    const cookie = await authed();
    const domenica = Date.UTC(2026, 9, 25, 9, 0); // 25 ottobre, torna l'ora solare: 10:00 a Roma
    await insertLead("tardi", { next_action_at: Date.UTC(2026, 9, 25, 22, 30) }); // 23:30 a Roma, stesso giorno
    await insertLead("lunedi", { next_action_at: Date.UTC(2026, 9, 25, 23, 30) }); // 00:30 di lunedì a Roma
    const o = (await (await call(`/api/today?chi=tutte&now=${domenica}`, {}, cookie)).json()) as Oggi;
    expect(o.daFare.map((l) => l.id)).toEqual(["tardi"]);
  });
});

// /stats resta quella della 1A: il test è lo stesso.
describe("numeri", () => {
  it("conta per fonte, campagna e fase, e misura la prima risposta", async () => {
    const cookie = await authed();
    await insertLead("m1", { source: "meta", meta_campaign: "Campagna A", stage_id: "chiuso", next_action: null, next_action_at: null, created_at: NOW });
    await insertLead("m2", { source: "meta", meta_campaign: "Campagna A", created_at: NOW });
    await insertLead("m3", { source: "meta", meta_campaign: "Campagna B", stage_id: "fake", next_action: null, next_action_at: null, created_at: NOW });
    await insertLead("x1", { created_at: NOW });
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a1', 'm1', 'chiamata', '', 'tommaso', ?), ('a2', 'm2', 'nota', '', 'tommaso', ?)")
      .bind(NOW + 3600_000, NOW + 7200_000)
      .run();
    const s = (await (await call(`/api/stats?from=${NOW - 1}&until=${NOW + 1}`, {}, cookie)).json()) as {
      bySource: { source: string; total: number; won: number; lost: number }[];
      byCampaign: { campaign: string; total: number; won: number }[];
      byStage: { stageId: string; count: number }[];
      firstResponse: { avgMs: number; count: number };
    };
    expect(s.bySource).toContainEqual({ source: "meta", total: 3, won: 1, lost: 1 });
    expect(s.byCampaign).toContainEqual({ campaign: "Campagna A", total: 2, won: 1, lost: 0 });
    expect(s.byStage.find((x) => x.stageId === "chiuso")?.count).toBe(1);
    expect(s.byStage).toHaveLength(12);
    expect(s.firstResponse).toEqual({ avgMs: 5_400_000, count: 2 });
  });
});
