import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = {
    id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, next_action: "Chiamare",
    next_action_at: NOW + 10 * DAY, created_at: NOW - DAY, updated_at: NOW, ...extra,
  };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

async function today(cookie: string) {
  const res = await call(`/api/today?from=${NOW - 1000}&until=${NOW + DAY}&now=${NOW}`, {}, cookie);
  return (await res.json()) as Record<string, { id: string }[]>;
}

describe("oggi", () => {
  it("mette insieme scadenze, call, lead nuovi, fermi e senza azione", async () => {
    const cookie = await authed();
    await insertLead("scaduto", { next_action_at: NOW - DAY });
    await insertLead("oggi", { next_action_at: NOW + 3600_000 });
    await insertLead("futuro");
    await insertLead("call", { appointment_at: NOW + 7200_000 });
    await insertLead("fermo", { stage_changed_at: NOW - 8 * DAY });
    await insertLead("senza", { next_action: null, next_action_at: null });
    await insertLead("chiuso-scaduto", { stage_id: "chiuso", next_action_at: NOW - DAY });
    await insertLead("cestinato", { next_action_at: NOW - DAY, deleted_at: NOW });
    await insertLead("meta-ko", { source: "meta", meta_status: "error" });
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a1', 'futuro', 'chiamata', 'x', 'tommaso', ?)").bind(NOW).run();

    const t = await today(cookie);
    expect(t.due.map((l) => l.id)).toEqual(["scaduto", "oggi"]);
    expect(t.appointments.map((l) => l.id)).toEqual(["call"]);
    expect(t.stale.map((l) => l.id)).toEqual(["fermo"]);
    expect(t.missingAction.map((l) => l.id)).toEqual(["senza"]);
    expect(t.untouched.map((l) => l.id)).not.toContain("futuro");
    expect(t.untouched.map((l) => l.id)).toContain("oggi");
    expect(t.metaIncomplete.map((l) => l.id)).toEqual(["meta-ko"]);
  });

  it("senza from e until risponde 400", async () => {
    const cookie = await authed();
    expect((await call("/api/today", {}, cookie)).status).toBe(400);
  });
});

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
