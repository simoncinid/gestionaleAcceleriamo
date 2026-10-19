import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { leggiToken, salvaToken } from "../worker/risponditore/token";

const NOW = Date.now();
const token = { igUserId: "1784", username: "acceleriamo", token: "IGAA-token-segreto-123", scadeIl: NOW + 60 * 86_400_000 };

describe("token Instagram cifrato", () => {
  it("salva e rilegge il token", async () => {
    await salvaToken(env, token, NOW);
    expect(await leggiToken(env)).toEqual(token);
    const riga = await env.DB.prepare("SELECT token_cifrato, rinnovato_il FROM ig_account WHERE id = 'principale'").first<{ token_cifrato: string; rinnovato_il: number }>();
    expect(riga?.token_cifrato).not.toContain(token.token);
    expect(riga?.token_cifrato.length).toBeGreaterThan(20);
    expect(riga?.rinnovato_il).toBe(NOW);
  });

  it("salvare di nuovo sostituisce il token", async () => {
    await salvaToken(env, token, NOW);
    await salvaToken(env, { ...token, token: "nuovo-token" }, NOW + 1);
    expect((await leggiToken(env))?.token).toBe("nuovo-token");
  });

  it("senza chiave leggiToken restituisce null", async () => {
    await salvaToken(env, token, NOW);
    expect(await leggiToken({ ...env, IG_TOKEN_KEY: undefined })).toBeNull();
  });
});
