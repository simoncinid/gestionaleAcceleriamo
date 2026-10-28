import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

describe("schema", () => {
  it("ha le 12 fasi del processo di vendita nell'ordine giusto (0020)", async () => {
    const { results } = await env.DB.prepare("SELECT id, label, kind, tone FROM stages ORDER BY sort_order").all<{ id: string; label: string; kind: string; tone: string }>();
    expect(results.map((r) => r.label)).toEqual([
      "Nuovo, da chiamare", "Da richiamare", "Conoscenza fissata", "In attesa offerta",
      "Offerta fissata", "Analisi fissata", "In attesa progetto", "Progetto fissato",
      "In attesa decisione", "Cliente", "Non interessato", "Non profilato",
    ]);
    expect(results.map((r) => r.id)).toEqual([
      "da-chiamare-prima-volta", "da-richiamare", "appuntamento-confermato", "in-attesa-preventivo",
      "presentazione-confermata", "analisi-fissata", "in-attesa-progetto", "progetto-fissato",
      "in-attesa-decisione", "chiuso", "non-chiuso", "fake",
    ]);
    expect(results.find((r) => r.id === "chiuso")).toMatchObject({ kind: "won", tone: "green" });
    expect(results.filter((r) => r.kind === "lost").map((r) => r.id)).toEqual(["non-chiuso", "fake"]);
    expect(results.some((r) => r.tone === "violet")).toBe(false);
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
