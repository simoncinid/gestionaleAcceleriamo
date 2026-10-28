import { describe, expect, it } from "vitest";
import { htmlAnteprima, leggiModulo, moduloGrafiche, versioneGrafiche, DESIGN_VERSIONE } from "../scripts/lib/risorse-grafiche";
import { firmaGrafiche, type Passo } from "../src/pagine/pubbliche/corpoRisorsa";

const passo = (numero: number, titolo: string): Passo => ({ numero, titolo, descrizione: "Descrizione del passo." });
const passi = [passo(1, "Arriva la richiesta"), passo(2, "Parte il promemoria"), passo(3, "Si registra tutto")];

describe("grafiche del risponditore: anteprima del link", () => {
  it("l'anteprima non interpreta HTML del titolo e non ha lineette", () => {
    const html = htmlAnteprima({ titolo: "Lo schema <b>dei dati</b>: l'invio", passi }, "/f", "<svg></svg>", "/i");
    expect(html).not.toContain("<b>dei dati</b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toMatch(/[–—]/);
  });

  it("regge anche una risorsa senza schema a passi", () => {
    const html = htmlAnteprima({ titolo: "Caso: l'agenzia che non perdeva più richieste", passi: [] }, "/f", "<svg></svg>", "/i");
    expect(html).toContain("agenzia");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("modulo per il Worker: si scrive e si rilegge uguale, la versione segue titolo, passi e disegno", () => {
    const { firma, v } = versioneGrafiche("Titolo", passi);
    expect(firma).toBe(firmaGrafiche("Titolo", passi));
    expect(versioneGrafiche("Titolo diverso", passi).firma).not.toBe(firma);
    expect(v).toBe(`${firma.slice(0, 6)}d${DESIGN_VERSIONE}`);
    const voci = { b: { firma, v }, a: { firma: "00000000", v: "000000d3" } };
    const testo = moduloGrafiche(voci);
    expect(testo.indexOf('"a"')).toBeLessThan(testo.indexOf('"b"'));
    expect(leggiModulo(testo)).toEqual(voci);
    expect(leggiModulo(moduloGrafiche({}))).toEqual({});
    // Il modulo di prima (con il campo video) si rilegge ancora.
    expect(leggiModulo('  "x": { firma: "0a0b0c0d", v: "0a0b0cd2", video: true },')).toEqual({ x: { firma: "0a0b0c0d", v: "0a0b0cd2" } });
  });
});
