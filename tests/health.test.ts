import { describe, expect, it } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";

describe("health", () => {
  it("risponde ok", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/health"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("un errore imprevisto diventa JSON con codice", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/_boom"), env, ctx);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; errorId: string };
    expect(body.error).toBe("Errore del server");
    expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
  });
});
