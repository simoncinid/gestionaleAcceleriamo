import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { chiamaClaude, ErroreClaude } from "../worker/claude/client";
import { setClaudeFetch } from "../worker/claude/fetcher";
import { rispostaClaude } from "./claude-fixture";

describe("chiamaClaude", () => {
  it("manda modello, schema e ricerca; legge testo, uso, fonti e modello vero", async () => {
    let corpo: Record<string, unknown> = {};
    let intestazioni: Headers = new Headers();
    setClaudeFetch(async (_u, init) => {
      corpo = JSON.parse(String(init!.body));
      intestazioni = new Headers(init!.headers);
      return rispostaClaude({ testo: "## Chi è\nOfficina", modello: "claude-sonnet-5", ricerche: 2, citazioni: [{ url: "https://officina.example", title: "Officina" }] });
    });
    const r = await chiamaClaude(env, { modello: "claude-sonnet-5-5", sistema: "s", testo: "t", maxTokens: 8000, ricerche: 5 });
    expect(corpo.model).toBe("claude-sonnet-5-5");
    expect(corpo.fallbacks).toBe("default");
    expect(corpo.thinking).toBeUndefined();
    expect(corpo.tool_choice).toBeUndefined();
    expect(corpo.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
    expect(intestazioni.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(intestazioni.get("x-api-key")).toBe(env.ANTHROPIC_API_KEY);
    expect(r.modello).toBe("claude-sonnet-5"); // il modello che ha risposto davvero
    expect(r.uso.ricerche).toBe(2);
    expect(r.fonti).toEqual([{ url: "https://officina.example", titolo: "Officina" }]);
  });

  it("Haiku: niente fallback né intestazione beta", async () => {
    let corpo: Record<string, unknown> = {};
    let intestazioni: Headers = new Headers();
    setClaudeFetch(async (_u, init) => {
      corpo = JSON.parse(String(init!.body));
      intestazioni = new Headers(init!.headers);
      return rispostaClaude({ testo: "ok" });
    });
    await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 300 });
    expect(corpo.fallbacks).toBeUndefined();
    expect(intestazioni.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("schema JSON in output_config e risposta già letta", async () => {
    let corpo: Record<string, unknown> = {};
    setClaudeFetch(async (_u, init) => { corpo = JSON.parse(String(init!.body)); return rispostaClaude({ testo: '{"azienda":true,"fake":false,"motivo":"sito vero"}' }); });
    const r = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 300, schema: { type: "object" } });
    expect(corpo.output_config).toEqual({ format: { type: "json_schema", schema: { type: "object" } } });
    expect(r.json).toEqual({ azienda: true, fake: false, motivo: "sito vero" });
  });

  it("pause_turn: continua la conversazione e somma l'uso", async () => {
    let n = 0;
    setClaudeFetch(async () => (++n === 1 ? rispostaClaude({ testo: "", stop: "pause_turn", ingresso: 500 }) : rispostaClaude({ testo: "fatto", ingresso: 700 })));
    const r = await chiamaClaude(env, { modello: "claude-sonnet-5-5", sistema: "s", testo: "t", maxTokens: 100, ricerche: 5 });
    expect(r.testo).toBe("fatto");
    expect(r.uso.ingresso).toBe(1200);
  });

  it("rifiuto e risposta troncata diventano ErroreClaude non ritentabili con l'uso dentro", async () => {
    setClaudeFetch(async () => rispostaClaude({ testo: "", stop: "refusal", ingresso: 300 }));
    const e = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100 }).catch((x) => x);
    expect(e).toBeInstanceOf(ErroreClaude);
    expect(e.ritentabile).toBe(false);
    expect(e.uso.ingresso).toBe(300);
    setClaudeFetch(async () => rispostaClaude({ testo: "{\"a\":", stop: "max_tokens", uscita: 100 }));
    const t = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100, schema: { type: "object" } }).catch((x) => x);
    expect(t.message).toBe("Risposta troncata");
    expect(t.ritentabile).toBe(false);
  });

  it("JSON rotto con lo schema: non ritentabile", async () => {
    setClaudeFetch(async () => rispostaClaude({ testo: "non json" }));
    const e = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100, schema: { type: "object" } }).catch((x) => x);
    expect(e.message).toBe("Risposta non leggibile");
    expect(e.ritentabile).toBe(false);
  });

  it("429 è ritentabile, 400 no, rete caduta è interrotta", async () => {
    setClaudeFetch(async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "piano" } }), { status: 429 }));
    const a = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100 }).catch((x) => x);
    expect(a.ritentabile).toBe(true);
    expect(a.interrotta).toBe(false);
    setClaudeFetch(async () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "no" } }), { status: 400 }));
    const c = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100 }).catch((x) => x);
    expect(c.ritentabile).toBe(false);
    setClaudeFetch(async () => { throw new TypeError("rete caduta"); });
    const b = await chiamaClaude(env, { modello: "claude-haiku-4-5", sistema: "s", testo: "t", maxTokens: 100 }).catch((x) => x);
    expect(b.interrotta).toBe(true);
  });
});
