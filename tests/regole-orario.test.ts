import { describe, expect, it } from "vitest";
import { ORARIO_DEFAULT, alleOre, minutiLavorativiTra, scadenzaLavorativa } from "../worker/regole/orario";

const roma = (g: number, h: number, m = 0) => Date.UTC(2026, 9, g, h - 2, m); // ottobre 2026 prima del 25: Roma = UTC+2

describe("SLA in orario di lavoro", () => {
  it("martedì alle 10 scade alle 12", () => {
    expect(scadenzaLavorativa(roma(13, 10), 120, ORARIO_DEFAULT)).toBe(roma(13, 12));
  });
  it("martedì alle 19 usa mezz'ora e finisce mercoledì alle 10", () => {
    expect(scadenzaLavorativa(roma(13, 19), 120, ORARIO_DEFAULT)).toBe(roma(14, 10));
  });
  it("prima dell'apertura parte dalle 8:30", () => {
    expect(scadenzaLavorativa(roma(13, 6), 120, ORARIO_DEFAULT)).toBe(roma(13, 10, 30));
  });
  it("venerdì alle 19:20 usa 10 minuti e finisce sabato mattina alle 10:20", () => {
    expect(scadenzaLavorativa(roma(16, 19, 20), 120, ORARIO_DEFAULT)).toBe(roma(17, 10, 20));
  });
  it("sabato sera e domenica sera partono lunedì alle 8:30", () => {
    expect(scadenzaLavorativa(roma(17, 20), 120, ORARIO_DEFAULT)).toBe(roma(19, 10, 30));
    expect(scadenzaLavorativa(roma(18, 22), 120, ORARIO_DEFAULT)).toBe(roma(19, 10, 30));
  });
  it("regge il cambio d'ora di domenica 25 ottobre", () => {
    expect(scadenzaLavorativa(Date.UTC(2026, 9, 24, 19, 0), 120, ORARIO_DEFAULT)).toBe(Date.UTC(2026, 9, 26, 9, 30));
  });
  it("conta solo i minuti di lavoro", () => {
    expect(minutiLavorativiTra(roma(17, 20), roma(19, 9), ORARIO_DEFAULT)).toBe(30);
    expect(minutiLavorativiTra(roma(13, 10), roma(13, 11, 15), ORARIO_DEFAULT)).toBe(75);
  });
  it("alle 10 del giorno dopo, saltando la domenica", () => {
    expect(alleOre(roma(13, 15), 1, 10, 0, ORARIO_DEFAULT)).toBe(roma(14, 10));
    expect(alleOre(roma(17, 15), 1, 10, 0, ORARIO_DEFAULT)).toBe(roma(19, 10));
  });
});
