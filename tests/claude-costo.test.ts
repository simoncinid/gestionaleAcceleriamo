import { describe, expect, it } from "vitest";
import { centsDaMicros, costoMassimoMicros, costoMicros, microsDaCents, prezzoDi } from "../worker/claude/costo";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";

const imp = IMPOSTAZIONI_DEFAULT.claude;
describe("costo di Claude", () => {
  it("usage d'esempio di Sonnet con due ricerche", () => {
    // 12.000 in ingresso x 2 + 3.000 in uscita x 10 + 2 ricerche x 10.000 = 24.000 + 30.000 + 20.000
    expect(costoMicros({ ingresso: 12_000, uscita: 3_000, cacheLettura: 0, cacheScrittura: 0, ricerche: 2 }, "claude-sonnet-5-5", imp)).toBe(74_000);
  });
  it("il prezzo si trova per prefisso, anche con la data nel nome", () => {
    expect(prezzoDi(imp, "claude-haiku-4-5-20251001").uscita).toBe(5);
    expect(prezzoDi(imp, "claude-sonnet-5-5-20260901").uscita).toBe(10);
    expect(prezzoDi(imp, "claude-opus-5-5").uscita).toBe(20);
  });
  it("vince il prefisso più lungo: Sonnet 5 del fallback non prende il prezzo di Sonnet 5.5 e viceversa", () => {
    const finto = { ...imp, prezzi: { ...imp.prezzi, "claude-sonnet-5": { ingresso: 3, uscita: 15, cacheLettura: 0, cacheScrittura: 0 } } };
    expect(prezzoDi(finto, "claude-sonnet-5").uscita).toBe(15);
    expect(prezzoDi(finto, "claude-sonnet-5-5").uscita).toBe(10);
  });
  it("modello sconosciuto: si usa il prezzo più alto del listino, mai zero", () => {
    expect(prezzoDi(imp, "claude-nuovo")).toEqual({ ingresso: 4, uscita: 20, cacheLettura: 0.4, cacheScrittura: 5 });
  });
  it("costo massimo: tutto il max_tokens in uscita e le ricerche piene", () => {
    expect(costoMassimoMicros({ modello: "claude-sonnet-5-5", ingresso: 160_000, maxTokens: 8_000, ricerche: 5 }, imp)).toBe(160_000 * 2 + 8_000 * 10 + 5 * 10_000);
  });
  it("centesimi e micro-dollari: si arrotonda sempre in su", () => {
    expect(microsDaCents(2000)).toBe(20_000_000);
    expect(centsDaMicros(1)).toBe(1);
    expect(centsDaMicros(1_234_567)).toBe(124);
  });
});
