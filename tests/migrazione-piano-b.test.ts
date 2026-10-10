import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("migrazione del Piano B", () => {
  it("crea le sei tabelle nuove", async () => {
    const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_jobs','claude_usage','campaign_spend','notifications','push_subscriptions','weekly_reviews')").all<{ name: string }>();
    expect(r.results.map((x) => x.name).sort()).toEqual(["ai_jobs", "campaign_spend", "claude_usage", "notifications", "push_subscriptions", "weekly_reviews"]);
  });

  it("aggiunge le colonne senza toccare le righe esistenti", async () => {
    const col = async (t: string) => (await env.DB.prepare(`PRAGMA table_info(${t})`).all<{ name: string }>()).results.map((x) => x.name);
    expect(await col("users")).toEqual(expect.arrayContaining(["telegram_chat_id", "notify_prefs", "quiet_hours", "telegram_codice"]));
    expect(await col("company_profiles")).toEqual(expect.arrayContaining(["model", "job_id", "classification"]));
    expect(await col("call_analyses")).toEqual(expect.arrayContaining(["call_id", "model", "job_id"]));
  });

  it("nessuna istruzione distruttiva nel file", async () => {
    const sql = (env.TEST_MIGRATIONS as { name: string; queries: string[] }[]).find((m) => m.name.includes("piano_b"))!.queries.join("\n");
    expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
  });

  it("0008: solo l'indice di Telegram, nessuna istruzione distruttiva", async () => {
    const m = (env.TEST_MIGRATIONS as { name: string; queries: string[] }[]).find((x) => x.name.includes("indice_telegram"))!;
    const sql = m.queries.join("\n");
    expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b|\bALTER\b/i);
    expect(m.queries.every((q) => /^\s*CREATE INDEX/i.test(q))).toBe(true);
    const i = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_notifications_telegram'").first();
    expect(i).toEqual({ name: "idx_notifications_telegram" });
  });
});
