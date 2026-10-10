import { describe, expect, it } from "vitest";
import { ammette, gruppoTask, primoMeseRicorrenti, ricorrenteDovuta, scadenzaRicorrente, scadenzaUnaTantum, taskIniziali } from "../worker/lavori/calcoli";
import { daRoma } from "../worker/lib/roma";

describe("calcoli dei lavori", () => {
  it("la scadenza una tantum è l'avvio più N giorni a mezzanotte di Roma, anche oltre il cambio d'ora", () => {
    expect(scadenzaUnaTantum(daRoma(2026, 10, 10), 3)).toBe(daRoma(2026, 10, 13));
    expect(scadenzaUnaTantum(daRoma(2026, 10, 20), 10)).toBe(daRoma(2026, 10, 30));
    expect(scadenzaUnaTantum(daRoma(2026, 4, 9), 45)).toBe(daRoma(2026, 5, 24));
  });
  it("le ricorrenti partono dal mese dell'avvio solo se l'avvio è il primo", () => {
    expect(primoMeseRicorrenti(daRoma(2026, 11, 1))).toBe("2026-11");
    expect(primoMeseRicorrenti(daRoma(2026, 10, 12))).toBe("2026-11");
    expect(primoMeseRicorrenti(daRoma(2026, 12, 15))).toBe("2027-01");
  });
  it("una ricorrente è dovuta dal giorno indicato e solo dal mese di inizio", () => {
    expect(ricorrenteDovuta(daRoma(2026, 11, 1, 7), "2026-11", 1)).toBe(true);
    expect(ricorrenteDovuta(daRoma(2026, 11, 9, 7), "2026-11", 10)).toBe(false);
    expect(ricorrenteDovuta(daRoma(2026, 11, 10, 7), "2026-11", 10)).toBe(true);
    expect(ricorrenteDovuta(daRoma(2026, 10, 20, 7), "2026-11", 1)).toBe(false);
    expect(ricorrenteDovuta(daRoma(2026, 11, 1, 7), null, 1)).toBe(false);
  });
  it("la scadenza ricorrente è il giorno del mese", () => {
    expect(scadenzaRicorrente("2026-11", 5)).toBe(daRoma(2026, 11, 5));
  });
  it("alla creazione nascono solo le una tantum", () => {
    const m = [
      { id: "a", title: "A", recurrence: "una_tantum" as const, assigneeId: null, dueDays: 3, monthDay: null },
      { id: "b", title: "B", recurrence: "ricorrente" as const, assigneeId: null, dueDays: null, monthDay: 1 },
    ];
    const t = taskIniziali(m, daRoma(2026, 10, 10));
    expect(t.map((x) => x.modello.id)).toEqual(["a"]);
    expect(t[0].dueAt).toBe(daRoma(2026, 10, 13));
  });
  it("il tipo decide quali task ammette", () => {
    expect(ammette("una_tantum", "ricorrente")).toBe(false);
    expect(ammette("ricorrente", "ricorrente")).toBe(true);
    expect(ammette("una_tantum_ricorrente", "una_tantum")).toBe(true);
  });
  it("raggruppa in ritardo, questa settimana, più avanti", () => {
    const oggi = daRoma(2026, 10, 14, 9); // mercoledì
    expect(gruppoTask(daRoma(2026, 10, 13), oggi)).toBe("in_ritardo");
    expect(gruppoTask(daRoma(2026, 10, 14), oggi)).toBe("questa_settimana");
    expect(gruppoTask(daRoma(2026, 10, 18), oggi)).toBe("questa_settimana");
    expect(gruppoTask(daRoma(2026, 10, 19), oggi)).toBe("piu_avanti");
    expect(gruppoTask(null, oggi)).toBe("piu_avanti");
  });
});
