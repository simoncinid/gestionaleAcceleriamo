import { describe, expect, it } from "vitest";
import { call, createUser, loginCookie } from "./helpers";

describe("messaggi di Zod in italiano", () => {
  it("un campo obbligatorio mancante non risponde in inglese", async () => {
    await createUser();
    const cookie = await loginCookie();
    const r = await call("/api/leads", { method: "POST", json: {} }, cookie);
    expect(r.status).toBe(400);
    const b = await r.json<{ error: string }>();
    expect(b.error).not.toMatch(/Required|Expected|Invalid/);
    expect(b.error).toMatch(/obbligatori|valore/);
  });

  it("PUT /api/campaign-spend: importo come testo e corpo vuoto rispondono in italiano", async () => {
    await createUser();
    const cookie = await loginCookie();
    const testo = await call("/api/campaign-spend", { method: "PUT", json: { campagna: "Campagna A", mese: "2026-10", amountCents: "2000" } }, cookie);
    expect(testo.status).toBe(400);
    expect((await testo.json<{ error: string }>()).error).toBe("Tipo di valore non valido (amountCents)");
    const vuoto = await call("/api/campaign-spend", { method: "PUT", json: {} }, cookie);
    expect(vuoto.status).toBe(400);
    expect((await vuoto.json<{ error: string }>()).error).toMatch(/^Manca un dato obbligatorio/);
  });
});
