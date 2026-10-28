import { describe, expect, it } from "vitest";
import { Lead } from "../src/pagine/commerciale/Lead";
import {
  FILTRI_BASE, conteggi, etichettaArrivo, filtra, intervalloArrivo, leggiFiltri, quantiFiltri, scriviFiltri, titoloLead,
} from "../src/pagine/commerciale/tabellaLead";
import { FASI, GIORNO, ORA, riga } from "./b1c-fixture";
import { render } from "./render";

// ORA = 28/10/2026 09:00 UTC, cioè le 10:00 a Roma (ora solare dal 25/10): il giorno di Roma inizia alle 23:00 UTC del 27.
const U = (m: number, g: number, h: number, mi = 0) => Date.UTC(2026, m - 1, g, h, mi);
const periodo = (dal: string, al: string) => ({ arr: "periodo" as const, dal, al });

describe("blocco 1 bis: intervalli del filtro Arrivati (Europe/Rome)", () => {
  it("Sempre: nessun limite", () => {
    expect(intervalloArrivo({ arr: "", dal: "", al: "" }, ORA)).toBeNull();
  });

  it("Oggi e Ieri sono giorni interi di Roma", () => {
    expect(intervalloArrivo({ arr: "oggi", dal: "", al: "" }, ORA)).toEqual({ da: U(10, 27, 23), a: U(10, 28, 23) });
    expect(intervalloArrivo({ arr: "ieri", dal: "", al: "" }, ORA)).toEqual({ da: U(10, 26, 23), a: U(10, 27, 23) });
  });

  it("Ultimi 7 giorni: oggi più i sei prima, a cavallo del cambio d'ora del 25/10", () => {
    // 22/10 era ancora ora legale: mezzanotte di Roma = 22:00 UTC del 21.
    expect(intervalloArrivo({ arr: "7g", dal: "", al: "" }, ORA)).toEqual({ da: U(10, 21, 22), a: U(10, 28, 23) });
    expect(intervalloArrivo({ arr: "30g", dal: "", al: "" }, ORA)).toEqual({ da: U(9, 28, 22), a: U(10, 28, 23) });
  });

  it("Questo mese e Mese scorso, anche a gennaio", () => {
    expect(intervalloArrivo({ arr: "mese", dal: "", al: "" }, ORA)).toEqual({ da: U(9, 30, 22), a: U(10, 31, 23) });
    expect(intervalloArrivo({ arr: "mese-scorso", dal: "", al: "" }, ORA)).toEqual({ da: U(8, 31, 22), a: U(9, 30, 22) });
    const gennaio = Date.UTC(2027, 0, 15, 12);
    expect(intervalloArrivo({ arr: "mese-scorso", dal: "", al: "" }, gennaio)).toEqual({ da: U(11, 30, 23), a: U(12, 31, 23) });
  });

  it("Periodo: dal e al compresi per intero, invertiti, uno solo, vuoto", () => {
    const atteso = { da: U(9, 30, 22), a: U(10, 15, 22) };
    expect(intervalloArrivo(periodo("2026-10-01", "2026-10-15"), ORA)).toEqual(atteso);
    expect(intervalloArrivo(periodo("2026-10-15", "2026-10-01"), ORA)).toEqual(atteso);
    expect(intervalloArrivo(periodo("2026-10-01", ""), ORA)).toEqual({ da: U(9, 30, 22), a: null });
    expect(intervalloArrivo(periodo("", "2026-10-15"), ORA)).toEqual({ da: null, a: U(10, 15, 22) });
    expect(intervalloArrivo(periodo("", ""), ORA)).toBeNull();
  });
});

describe("blocco 1 bis: filtro Arrivati nella tabella", () => {
  const LEADS = [
    riga("mezzanotte", { createdAt: U(10, 27, 23, 30) }), // 00:30 di oggi a Roma
    riga("tarda", { createdAt: U(10, 27, 22, 59) }), // 23:59 di ieri a Roma
    riga("settimana", { createdAt: ORA - 5 * GIORNO, scadenza: ORA - 3 * GIORNO, stato: "scaduto" }),
    riga("vecchio", { createdAt: U(9, 10, 10) }),
    riga("cliente", { stageId: "chiuso", createdAt: U(10, 28, 8) }),
  ];

  it("si combina con il segmento e con i conteggi del titolo", () => {
    expect(filtra(LEADS, { ...FILTRI_BASE, arr: "oggi" }, ORA).map((l) => l.id)).toEqual(["mezzanotte"]);
    expect(filtra(LEADS, { ...FILTRI_BASE, arr: "ieri" }, ORA).map((l) => l.id)).toEqual(["tarda"]);
    expect(filtra(LEADS, { ...FILTRI_BASE, seg: "chiusi", arr: "oggi" }, ORA).map((l) => l.id)).toEqual(["cliente"]);
    expect(conteggi(LEADS, { ...FILTRI_BASE, arr: "7g" }, ORA)).toEqual({ aperti: 3, scaduti: 1 });
    expect(filtra(LEADS, { ...FILTRI_BASE, ...periodo("2026-09-10", "2026-09-10") }, ORA).map((l) => l.id)).toEqual(["vecchio"]);
  });

  it("vive nell'indirizzo e conta tra i filtri del telefono", () => {
    const f = { ...FILTRI_BASE, ...periodo("2026-10-01", "2026-10-15") };
    const p = scriviFiltri(f);
    expect(p.toString()).toBe("arr=periodo&dal=2026-10-01&al=2026-10-15");
    expect(leggiFiltri(p)).toEqual(f);
    expect(leggiFiltri(new URLSearchParams("arr=7g&dal=2026-10-01"))).toMatchObject({ arr: "7g", dal: "", al: "" });
    expect(leggiFiltri(new URLSearchParams("arr=domani")).arr).toBe("");
    expect(quantiFiltri({ ...FILTRI_BASE, arr: "mese" })).toBe(1);
  });

  it("testo del filtro chiuso", () => {
    expect(etichettaArrivo(FILTRI_BASE)).toBe("Sempre");
    expect(etichettaArrivo({ arr: "7g", dal: "", al: "" })).toBe("Ultimi 7 giorni");
    expect(etichettaArrivo(periodo("2026-10-15", "2026-10-01"))).toBe("dal 01/10 al 15/10");
    expect(etichettaArrivo(periodo("2026-10-01", ""))).toBe("dal 01/10");
    expect(etichettaArrivo(periodo("", "2026-10-15"))).toBe("fino al 15/10");
  });

  it("la pagina mostra il filtro acceso e il titolo filtrato", () => {
    const pagina = (percorso: string) =>
      render(<Lead ora={ORA} />, { percorso, dati: [[["leads", "tabella"], LEADS], [["stages"], FASI], [["users"], [{ id: "tommaso", name: "Tommaso" }]]] });
    const spento = pagina("/commerciale/lead");
    expect(spento).toContain('data-filtro="Arrivati"');
    expect(spento).toContain(">Sempre<");
    const acceso = pagina("/commerciale/lead?arr=oggi");
    expect(acceso).toContain(titoloLead({ aperti: 1, scaduti: 0 }));
    expect(acceso).toContain("Officina mezzanotte");
    expect(acceso).not.toContain("Officina tarda");
  });
});
