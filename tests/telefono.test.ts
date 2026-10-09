import { describe, expect, it } from "vitest";
import { aE164 } from "../worker/lib/telefono";
import { normalizePhone } from "../worker/lib/normalize";
import { normalizzaAzienda } from "../worker/lib/testo";

describe("telefono in E.164", () => {
  it.each([
    ["333 000 0011", "+393330000011"],
    ["+39 333-0000011", "+393330000011"],
    ["0039 333 0000011", "+393330000011"],
    ["393330000011", "+393330000011"],
    ["(+39) 333.000.0011", "+393330000011"],
    ["050 000011", "+39050000011"],
    ["+41 79 000 00 11", "+41790000011"],
    ["0041 79 000 00 11", "+41790000011"],
  ])("%s diventa %s", (grezzo, atteso) => {
    expect(aE164(grezzo)).toBe(atteso);
  });
  it.each([[""], [null], ["12"], ["non ho il telefono"]])("%s non è un telefono", (grezzo) => {
    expect(aE164(grezzo)).toBeNull();
  });
  it("lo stesso numero scritto in modi diversi dà la stessa chiave dei doppioni", () => {
    const chiavi = ["333 000 0011", "+39 333-0000011", "0039 3330000011", aE164("333 000 0011")].map(normalizePhone);
    expect(new Set(chiavi).size).toBe(1);
  });
});

describe("nome d'azienda normalizzato", () => {
  it("toglie forma societaria, accenti, maiuscole e punteggiatura", () => {
    const varianti = ["Officina Prova S.r.l.", "officina prova srl", "Officina Próva", "OFFICINA  PROVA s.r.l", "Officina Prova SRLS"];
    expect(new Set(varianti.map(normalizzaAzienda))).toEqual(new Set(["officina prova"]));
    expect(normalizzaAzienda("Rossi & Figli S.p.A.")).toBe("rossi figli");
    expect(normalizzaAzienda(null)).toBe("");
  });
});
