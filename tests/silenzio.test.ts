import { describe, expect, it } from "vitest";
import { canaleAcceso, inSilenzio } from "../worker/avvisi/silenzio";
import { daRoma } from "../worker/lib/roma";

const s = JSON.stringify({ attive: true, da: "22:00", a: "07:30" });
describe("ore di silenzio", () => {
  it("attraversa la mezzanotte sul fuso di Roma", () => {
    expect(inSilenzio(s, daRoma(2026, 10, 12, 23, 0))).toBe(true);
    expect(inSilenzio(s, daRoma(2026, 10, 13, 7, 0))).toBe(true);
    expect(inSilenzio(s, daRoma(2026, 10, 13, 7, 30))).toBe(false);
    expect(inSilenzio(s, daRoma(2026, 10, 13, 12, 0))).toBe(false);
  });
  it("dentro la stessa giornata", () => {
    const pranzo = JSON.stringify({ attive: true, da: "13:00", a: "14:00" });
    expect(inSilenzio(pranzo, daRoma(2026, 10, 13, 13, 30))).toBe(true);
    expect(inSilenzio(pranzo, daRoma(2026, 10, 13, 14, 0))).toBe(false);
  });
  it("spente, assenti o rovinate: mai silenzio", () => {
    expect(inSilenzio(null, 0)).toBe(false);
    expect(inSilenzio(JSON.stringify({ attive: false, da: "00:00", a: "23:59" }), 0)).toBe(false);
    expect(inSilenzio("{rotto", 0)).toBe(false);
  });
  it("evento spento nel profilo", () => {
    expect(canaleAcceso(JSON.stringify({ meta_48h: false }), "meta_48h")).toBe(false);
    expect(canaleAcceso(JSON.stringify({ meta_48h: false }), "lead_nuovo")).toBe(true);
    expect(canaleAcceso(null, "lead_nuovo")).toBe(true);
    expect(canaleAcceso("{rotto", "lead_nuovo")).toBe(true);
  });
});
