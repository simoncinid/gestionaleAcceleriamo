import { describe, expect, it } from "vitest";
import { callPerData, dataDalTitolo, tipoAutomatico } from "../worker/leads/tipo-documento";

// Regole automatiche dei documenti (30/10/2026): tipo dal nome, data dal titolo, call più vicina prima della data.
describe("tipo e call automatici", () => {
  it("tipo dal nome del file e dal titolo", () => {
    expect(tipoAutomatico("voce.M4A")).toBe("registrazione");
    expect(tipoAutomatico("x.txt", "Trascrizione consulenza 28/10")).toBe("trascrizione");
    expect(tipoAutomatico("Preventivo Talbi.pdf")).toBe("preventivo");
    expect(tipoAutomatico("x.pdf", "Preventivo Talbi")).toBe("preventivo");
    expect(tipoAutomatico("preventivo.xlsx")).toBe("altro");
    expect(tipoAutomatico("note.txt")).toBe("altro");
  });

  it("data GG/MM: anno di oggi, o quello prima se cadrebbe nel futuro", () => {
    const ora = Date.UTC(2026, 9, 30, 10);
    expect(dataDalTitolo("Registrazione consulenza 28/10", ora)).toBe(Date.UTC(2026, 9, 28, 12));
    expect(dataDalTitolo("Registrazione 15/12", ora)).toBe(Date.UTC(2025, 11, 15, 12));
    expect(dataDalTitolo("Preventivo 3.11.2026", ora)).toBe(Date.UTC(2026, 10, 3, 12));
    expect(dataDalTitolo("Preventivo v2", ora)).toBeNull();
    expect(dataDalTitolo("33/13", ora)).toBeNull();
  });

  it("ultima call non saltata prima della data; con solo il giorno vale tutta la giornata", () => {
    const c = (id: string, g: number, h: number, outcome: string | null = "fatta") => ({ id, kind: "offerta", scheduledAt: Date.UTC(2026, 9, g, h), outcome });
    const elenco = [c("a", 20, 9), c("b", 27, 16), c("s", 28, 9, "saltata"), c("r", 28, 10, "rimandata")];
    expect(callPerData(elenco, Date.UTC(2026, 9, 29, 0))?.id).toBe("b");
    expect(callPerData(elenco, Date.UTC(2026, 9, 27, 12))?.id).toBe("a");
    expect(callPerData(elenco, Date.UTC(2026, 9, 27, 12), true)?.id).toBe("b");
    expect(callPerData(elenco, Date.UTC(2026, 9, 1, 12))).toBeNull();
  });
});
