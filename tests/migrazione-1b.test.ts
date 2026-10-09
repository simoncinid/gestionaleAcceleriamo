import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

const NOW = 1_800_000_000_000;

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: id, source: "manuale", stage_id: "da-richiamare", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

describe("migrazioni del Piano A", () => {
  it("le fasi hanno probabilità, azione proposta e motivo obbligatorio solo per le perse", async () => {
    const { results } = await env.DB.prepare("SELECT id, probability, suggested_next_action, requires_reason FROM stages ORDER BY sort_order").all<{ id: string; probability: number; suggested_next_action: string | null; requires_reason: number }>();
    expect(results).toHaveLength(12);
    expect(results.find((s) => s.id === "da-chiamare-prima-volta")).toMatchObject({ probability: 10, suggested_next_action: "Prima chiamata", requires_reason: 0 });
    expect(results.filter((s) => s.requires_reason === 1).map((s) => s.id)).toEqual(["non-chiuso", "fuori-target", "fake"]);
    const aperte = results.slice(0, 7).map((s) => s.probability);
    expect(Math.min(...aperte)).toBe(10);
    expect(Math.max(...aperte)).toBe(80);
  });

  it("scrive la mappa regola e fase di partenza", async () => {
    const { results } = await env.DB.prepare("SELECT rule_key, stage_id, event, params, active FROM stage_rules ORDER BY rule_key, stage_id").all<{ rule_key: string; stage_id: string | null; event: string | null; params: string; active: number }>();
    expect(results.map((r) => `${r.rule_key}:${r.stage_id ?? r.event ?? "tutte"}`)).toEqual([
      "fermo:tutte", "pausa:probabilmente-bloccato", "preventivo_48h:call_conoscenza_fatta", "ricontatti:in-attesa-decisione",
      "sla:da-chiamare-prima-volta", "tentativi:da-richiamare", "tentativi:non-chiamato",
    ]);
    expect(JSON.parse(results.find((r) => r.rule_key === "sla")!.params)).toEqual({ minuti: 120, avvisoMinuti: 90 });
    expect(results.every((r) => r.active === 1)).toBe(true);
  });

  it("modelli di partenza e stato del foglio", async () => {
    const { results } = await env.DB.prepare("SELECT key, channel FROM message_templates ORDER BY sort_order").all<{ key: string; channel: string }>();
    expect(results).toHaveLength(8);
    expect(results.find((t) => t.key === "conferma")?.channel).toBe("email");
    const foglio = await env.DB.prepare("SELECT last_row FROM sheet_sync_state WHERE id = 'foglio-andrea'").first<{ last_row: number }>();
    expect(foglio?.last_row).toBe(1);
  });

  it("porta call e proposte della 1A nelle tabelle nuove", async () => {
    await insertLead("conosc", { appointment_at: NOW + 1000, meet_link: "https://meet.google.com/a" });
    await insertLead("present", { appointment_at: NOW + 2000, stage_id: "presentazione-confermata" });
    await insertLead("propo", { proposal_url: "https://drive.google.com/x", stage_id: "in-attesa-decisione" });
    await insertLead("nulla");
    const mig = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0004"))!;
    for (const q of mig.queries.filter((q) => /INSERT INTO (calls|proposals)/.test(q))) await env.DB.prepare(q).run();

    const calls = await env.DB.prepare("SELECT lead_id, kind, scheduled_at, meet_link FROM calls ORDER BY lead_id").all<{ lead_id: string; kind: string; scheduled_at: number; meet_link: string | null }>();
    expect(calls.results).toEqual([
      { lead_id: "conosc", kind: "conoscenza", scheduled_at: NOW + 1000, meet_link: "https://meet.google.com/a" },
      { lead_id: "present", kind: "presentazione", scheduled_at: NOW + 2000, meet_link: null },
    ]);
    const prop = await env.DB.prepare("SELECT lead_id, number, status, registered_via, pdf_url, setup_cents FROM proposals").all();
    expect(prop.results).toEqual([{ lead_id: "propo", number: "1A-propo", status: "registrata", registered_via: "migrazione", pdf_url: "https://drive.google.com/x", setup_cents: null }]);
  });

  it("requestId delle attività è unico", async () => {
    await insertLead("x");
    const ins = "INSERT INTO activities (id, lead_id, type, body, created_at, request_id) VALUES (?, 'x', 'esito', '', 1, 'r1')";
    await env.DB.prepare(ins).bind("a1").run();
    await expect(env.DB.prepare(ins).bind("a2").run()).rejects.toThrow(/UNIQUE/);
  });
});
