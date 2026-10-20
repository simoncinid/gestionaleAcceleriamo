import { describe, expect, it } from "vitest";
import { chiavePasso, htmlAnimazione, htmlChiamata, htmlPasso, leggiModulo, moduloGrafiche, tempiAnimazione, versioneGrafiche, DESIGN_VERSIONE } from "../scripts/lib/risorse-grafiche";
import { firmaPassi } from "../src/pagine/pubbliche/corpoRisorsa";

const passo = (numero: number, titolo: string, descrizione = "") => ({ numero, titolo, descrizione });

describe("grafiche del risponditore", () => {
  it("la parola chiave del passo è la parola piena più lunga", () => {
    expect(chiavePasso("Registrazione dei dati")).toEqual(["", "Registrazione", " dei dati"]);
    expect(chiavePasso("Il giorno prima parte il promemoria")).toEqual(["Il giorno prima parte il ", "promemoria", ""]);
    expect(chiavePasso("Follow-up")).toEqual(["", "Follow-up", ""]);
    expect(chiavePasso("e di")).toEqual(["e di", "", ""]);
    expect(chiavePasso("Elenco dell'agente e controllo")).toEqual(["Elenco dell'", "agente", " e controllo"]);
  });

  it("l'animazione dura tra 8 e 14 secondi da 3 a 7 passi, con apertura di circa 1,2 s e chiusura di circa 1,5 s", () => {
    for (let n = 3; n <= 7; n++) {
      const t = tempiAnimazione(n);
      expect(t.durata).toBeGreaterThanOrEqual(8);
      expect(t.durata).toBeLessThanOrEqual(14);
      expect(t.apertura).toBeCloseTo(1.2, 1);
      expect(t.durata - t.chiusura).toBeGreaterThanOrEqual(1.4);
      expect(t.durata - t.chiusura).toBeLessThanOrEqual(2.2);
      // ogni passo resta tra 1 e 1,3 secondi a schermo intero prima di lasciare il posto
      expect(t.ingresso + t.sosta).toBeGreaterThanOrEqual(1);
      expect(t.ingresso + t.sosta).toBeLessThanOrEqual(1.4);
      expect(t.chiusura).toBeCloseTo(t.apertura + n * t.passo, 5);
    }
  });

  it("l'animazione: nessun testo sotto i 40 px, niente corsivi, gradienti, lineette né HTML del titolo", () => {
    const passi = [passo(1, "Registrazione dei dati"), passo(2, "Invio delle richieste"), passo(3, "Report")];
    const html = htmlAnimazione({ titolo: "Lo schema <b>dei dati</b>: come ordinare", passi }, "/f", "<svg></svg>");
    for (const m of html.matchAll(/font:\s*(?:\d+\s+)?(\d+)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(40);
    expect(html).not.toMatch(/font-size:\s*(?:[0-3]\d|\d)px/);
    expect(html).not.toMatch(/italic|gradient|[\u2013\u2014]/);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html.match(/class="scena passo"/g)).toHaveLength(3);
    expect(html).toContain("passo 2 di 3");
  });

  it("le schede non interpretano HTML del corpo e non hanno lineette", () => {
    const html = htmlPasso(passo(2, "<img src=x> l'invio"), 1, 4, "/f");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("passo 2 di 4");
    expect(htmlPasso(passo(3, '"Confermo"'), 2, 4, "/f")).toContain("\u201c");
    for (const h of [html, htmlChiamata("/f")]) expect(h).not.toMatch(/[\u2013\u2014]/);
  });

  it("modulo per il Worker: si scrive e si rilegge uguale, la versione segue firma e disegno", () => {
    const passi = [passo(1, "Uno"), passo(2, "Due")];
    const { firma, v } = versioneGrafiche(passi);
    expect(firma).toBe(firmaPassi(passi));
    expect(v).toBe(`${firma.slice(0, 6)}d${DESIGN_VERSIONE}`);
    const voci = { "b-slug": { firma, v, video: true }, "a-slug": { firma: "0000abcd", v: "0000abd1", video: false } };
    const testo = moduloGrafiche(voci);
    expect(testo.indexOf('"a-slug"')).toBeLessThan(testo.indexOf('"b-slug"'));
    expect(leggiModulo(testo)).toEqual(voci);
    expect(leggiModulo(moduloGrafiche({}))).toEqual({});
  });
});
