import { describe, expect, it } from "vitest";
import { authed, call } from "./helpers";

// Blocco 1, modifica 4: nome, azione e scadenza delle fasi non si cambiano più dalle Impostazioni.
describe("rotte delle fasi in sola lettura", () => {
  it("PATCH di una fase: nome, azione e scadenza rifiutati con 422", async () => {
    const cookie = await authed();
    for (const json of [{ label: "Altro nome" }, { suggestedNextAction: "Altro" }, { suggestedDelayHours: 5 }, { requiresReason: false }]) {
      const r = await call("/api/stages/da-richiamare", { method: "PATCH", json }, cookie);
      expect(r.status, JSON.stringify(json)).toBe(422);
    }
  });

  it("PUT delle regole delle fasi (scadenze) rifiutato con 422", async () => {
    const cookie = await authed();
    const { rules } = (await (await call("/api/stage-rules", {}, cookie)).json()) as { rules: { id: string; stageId: string | null; event: string | null; params: unknown; active: boolean }[] };
    const r = await call("/api/stage-rules", { method: "PUT", json: { rules: [{ ...rules[0] }] } }, cookie);
    expect(r.status).toBe(422);
  });
});
