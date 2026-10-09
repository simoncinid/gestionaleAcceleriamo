import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

describe("schema", () => {
  it("ha le 12 fasi del prototipo nell'ordine giusto", async () => {
    const { results } = await env.DB.prepare("SELECT id, kind FROM stages ORDER BY sort_order").all<{ id: string; kind: string }>();
    expect(results.map((r) => r.id)).toEqual([
      "da-chiamare-prima-volta", "non-chiamato", "da-richiamare", "appuntamento-confermato",
      "presentazione-confermata", "in-attesa-preventivo", "in-attesa-decisione", "probabilmente-bloccato",
      "chiuso", "non-chiuso", "fuori-target", "fake",
    ]);
    expect(results.find((r) => r.id === "chiuso")?.kind).toBe("won");
    expect(results.filter((r) => r.kind === "lost").map((r) => r.id)).toEqual(["non-chiuso", "fuori-target", "fake"]);
  });

  it("ha le tabelle per il rilascio 1B già pronte", async () => {
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of ["users", "sessions", "leads", "activities", "documents", "company_profiles", "call_analyses", "audit_log"]) {
      expect(names).toContain(t);
    }
  });

  it("non accetta due lead con lo stesso id Meta", async () => {
    const insert = "INSERT INTO leads (id, company, source, meta_lead_id, stage_id, stage_changed_at, created_at, updated_at) VALUES (?, 'A', 'meta', 'm1', 'da-chiamare-prima-volta', 0, 0, 0)";
    await env.DB.prepare(insert).bind("a").run();
    await expect(env.DB.prepare(insert).bind("b").run()).rejects.toThrow();
  });
});
