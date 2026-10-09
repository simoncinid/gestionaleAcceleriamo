import { describe, expect, it } from "vitest";
import { calcolaPunteggio, datiPerPunteggio, type RegolaPunteggio } from "../worker/regole/punteggio";

const REGOLE: RegolaPunteggio[] = [
  { campo: "email", operatore: "non_contiene", valore: "gmail.", punti: 1 },
  { campo: "website", operatore: "presente", valore: "", punti: 1 },
  { campo: "dipendenti", operatore: "contiene", valore: "più di 10", punti: 1 },
];

describe("punteggio a regole", () => {
  it("grigio, giallo, verde", () => {
    expect(calcolaPunteggio({ email: "a@gmail.com" }, REGOLE)).toBe("grigio");
    expect(calcolaPunteggio({ email: "a@officina.it" }, REGOLE)).toBe("giallo");
    expect(calcolaPunteggio({ email: "a@officina.it", website: "officina.it" }, REGOLE)).toBe("verde");
  });
  it("non conta l'email vuota come non gmail e ignora le maiuscole", () => {
    expect(calcolaPunteggio({ email: null }, REGOLE)).toBe("grigio");
    expect(calcolaPunteggio({ email: "a@GMAIL.com", dipendenti: "Più di 10" }, REGOLE)).toBe("giallo");
  });
  it("legge le risposte del modulo Meta", () => {
    const dati = datiPerPunteggio({ email: "x@y.it", metaAnswers: JSON.stringify({ dipendenti: "più di 10" }) });
    expect(dati.dipendenti).toBe("più di 10");
    expect(calcolaPunteggio(dati, REGOLE)).toBe("verde");
  });
});
