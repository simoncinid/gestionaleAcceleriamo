import { describe, expect, it } from "vitest";
import { daRoma, inizioGiornoRoma, meseRoma, partiRoma } from "../worker/lib/roma";

describe("fuso di Roma", () => {
  it("legge l'ora legale e l'ora solare", () => {
    expect(partiRoma(Date.UTC(2026, 9, 13, 8, 0))).toMatchObject({ anno: 2026, mese: 10, giorno: 13, ore: 10, minuti: 0, settimana: 2 });
    expect(partiRoma(Date.UTC(2026, 10, 12, 9, 0))).toMatchObject({ ore: 10, giorno: 12, mese: 11 });
  });
  it("converte un'ora di Roma in UTC anche a cavallo del cambio d'ora", () => {
    expect(daRoma(2026, 10, 13, 10, 0)).toBe(Date.UTC(2026, 9, 13, 8, 0));
    expect(daRoma(2026, 11, 12, 10, 0)).toBe(Date.UTC(2026, 10, 12, 9, 0));
    expect(daRoma(2026, 10, 25, 8, 30)).toBe(Date.UTC(2026, 9, 25, 7, 30)); // 25/10: torna l'ora solare
  });
  it("dà il mese e l'inizio del giorno", () => {
    expect(meseRoma(Date.UTC(2026, 9, 31, 23, 30))).toBe("2026-11"); // a Roma è già l'1 novembre
    expect(inizioGiornoRoma(Date.UTC(2026, 9, 13, 8, 0))).toBe(Date.UTC(2026, 9, 12, 22, 0));
  });
});
