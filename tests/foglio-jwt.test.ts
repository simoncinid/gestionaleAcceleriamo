import { describe, expect, it } from "vitest";
import { firmaJwt } from "../worker/foglio/jwt";
import { chiaveDiProva } from "./foglio-chiave";

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

describe("JWT dell'account di servizio", () => {
  it("RS256 verificabile con la chiave pubblica, scope in sola lettura, scade dopo un'ora", async () => {
    const { pem, pubblica } = await chiaveDiProva();
    const now = Date.UTC(2026, 9, 13, 8, 0);
    const jwt = await firmaJwt("sa@prova.iam.gserviceaccount.com", pem, now);
    const [h, c, firma] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64(h)))).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(new TextDecoder().decode(b64(c)));
    expect(claims).toMatchObject({ iss: "sa@prova.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token" });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pubblica, b64(firma), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
});
