import { describe, expect, it } from "vitest";
import {
  conteggioBadge, daIsoGiorno, euro, fermoDa, linkTel, linkWhatsApp, momento, percentuale, presetQuando, quando, riempiModello,
  giorno, ilGiorno, isoGiorno, nomeMese, mesiRecenti, percentualeOppureNd, euroCentesimi, centesimiDaTesto, scadenzaFattura, telefonoMostrato, testoSla, trascorso,
} from "../src/format";

const ORA = Date.UTC(2026, 9, 13, 8, 0); // martedì 13 ottobre 2026, 10:00 a Roma
const MIN = 60_000;
const ORA_H = 3_600_000;
const GIORNO = 86_400_000;

describe("quando", () => {
  it("scrive oggi, domani, giorno della settimana, data", () => {
    expect(quando(ORA + 2 * ORA_H, ORA)).toBe("oggi 12:00");
    expect(quando(Date.UTC(2026, 9, 14, 8, 0), ORA)).toBe("domani 10:00");
    expect(quando(Date.UTC(2026, 9, 18, 8, 0), ORA)).toBe("dom 18 ott, 10:00");
    expect(quando(Date.UTC(2026, 10, 12, 9, 0), ORA)).toBe("12 nov, 10:00");
    expect(quando(Date.UTC(2027, 0, 12, 9, 0), ORA)).toBe("12 gen 2027, 10:00");
  });
  it("scrive le scadute", () => {
    expect(quando(ORA - 25 * MIN, ORA)).toBe("scaduta da 25 min");
    expect(quando(ORA - ORA_H, ORA)).toBe("scaduta da 1 h");
    expect(quando(ORA - 3 * GIORNO, ORA)).toBe("scaduta da 3 giorni");
    expect(quando(ORA - GIORNO, ORA)).toBe("scaduta da 1 giorno");
  });
  it("vuoto senza data", () => {
    expect(quando(null, ORA)).toBe("");
  });
});

describe("storico e tempi", () => {
  it("momento: oggi, ieri, data", () => {
    expect(momento(ORA - 2 * ORA_H, ORA)).toBe("oggi 08:00");
    expect(momento(ORA - GIORNO, ORA)).toBe("ieri 10:00");
    expect(momento(Date.UTC(2026, 9, 7, 7, 30), ORA)).toBe("mer 7 ott, 09:30");
  });
  it("trascorso", () => {
    expect(trascorso(ORA - 30_000, ORA)).toBe("adesso");
    expect(trascorso(ORA - 25 * MIN, ORA)).toBe("25 min fa");
    expect(trascorso(ORA - 2 * ORA_H, ORA)).toBe("2 h fa");
    expect(trascorso(ORA - 3 * GIORNO, ORA)).toBe("3 giorni fa");
  });
  it("fermo da 7 giorni in su, in mesi oltre 60", () => {
    expect(fermoDa(ORA - 3 * GIORNO, ORA)).toBeNull();
    expect(fermoDa(ORA - 9 * GIORNO, ORA)).toBe("fermo da 9 giorni");
    expect(fermoDa(ORA - 90 * GIORNO, ORA)).toBe("fermo da 3 mesi");
  });
  it("preset di quando", () => {
    const p = presetQuando(ORA);
    expect(p.map((x) => x.etichetta)).toEqual(["Tra 1 ora", "Oggi 18:00", "Domani 10:00", "Tra 3 giorni"]);
    expect(p[0].ms).toBe(ORA + ORA_H);
    expect(p[1].ms).toBe(Date.UTC(2026, 9, 13, 16, 0));
    expect(p[2].ms).toBe(Date.UTC(2026, 9, 14, 8, 0));
    expect(p[3].ms).toBe(Date.UTC(2026, 9, 16, 8, 0));
  });
});

describe("soldi, conteggi, telefoni, modelli", () => {
  it("euro dai centesimi, punto per le migliaia, niente decimali", () => {
    expect(euro(180_000)).toBe("€ 1.800");
    expect(euro(1_250_000)).toBe("€ 12.500");
    expect(euro(15_000)).toBe("€ 150");
    expect(euro(0)).toBe("€ 0");
    expect(euro(-30_000)).toBe("-€ 300");
    expect(euro(null)).toBe("");
  });
  it("badge e percentuali", () => {
    expect(conteggioBadge(0)).toBeNull();
    expect(conteggioBadge(4)).toBe("4");
    expect(conteggioBadge(12)).toBe("9+");
    expect(percentuale(3, 8)).toBe("38%");
    expect(percentuale(1, 4)).toBe("n.d.");
  });
  it("telefoni e link", () => {
    expect(telefonoMostrato("+393331234567")).toBe("+39 333 123 4567");
    expect(telefonoMostrato("+41791234567")).toBe("+41791234567");
    expect(telefonoMostrato(null)).toBe("");
    expect(linkTel("+393331234567")).toBe("tel:+393331234567");
    expect(linkWhatsApp("+393331234567", "Ciao Luca")).toBe("https://wa.me/393331234567?text=Ciao%20Luca");
    expect(linkWhatsApp("+393331234567")).toBe("https://wa.me/393331234567");
  });
  it("riempie i segnaposto dei modelli", () => {
    expect(riempiModello("Ciao {referente}, {azienda} {ignoto}", { referente: "Luca", azienda: "Bertini" })).toBe("Ciao Luca, Bertini ");
  });
});

describe("timer delle 2 ore", () => {
  it("prima e dopo la scadenza", () => {
    expect(testoSla(ORA + 40 * 60_000, ORA)).toBe("mancano 40 min");
    expect(testoSla(ORA + 70 * 60_000, ORA)).toBe("mancano 1 h 10 min");
    expect(testoSla(ORA + 120 * 60_000, ORA)).toBe("mancano 2 h");
    expect(testoSla(ORA - 20 * 60_000, ORA)).toBe("scaduto da 20 min");
  });
});

describe("giorni senza ora", () => {
  it("giorno breve, anno solo se diverso", () => {
    expect(giorno(Date.UTC(2026, 10, 15, 10, 0), ORA)).toBe("15 nov");
    expect(giorno(Date.UTC(2027, 0, 3, 10, 0), ORA)).toBe("3 gen 2027");
    expect(giorno(Date.UTC(2026, 9, 31, 23, 30), ORA)).toBe("1 nov"); // a Roma è già l'1
  });
  it("ISO avanti e indietro sul fuso di Roma", () => {
    expect(isoGiorno(Date.UTC(2026, 9, 31, 23, 30))).toBe("2026-11-01");
    expect(daIsoGiorno("2026-11-15")).toBe(Date.UTC(2026, 10, 15, 11, 0));
    expect(daIsoGiorno("15/11/2026")).toBeNull();
    expect(nomeMese("2026-10")).toBe("ottobre 2026");
  });
});

describe("scadenzaFattura (QA 16, giorno di Roma)", () => {
  const venerdi2320 = Date.UTC(2026, 9, 9, 21, 20); // venerdì 9 ottobre, 23:20 a Roma
  it("oggi, domani, scaduta da N giorni, altrimenti il giorno", () => {
    expect(scadenzaFattura(Date.UTC(2026, 9, 9, 10, 0), venerdi2320)).toBe("scade oggi");
    expect(scadenzaFattura(Date.UTC(2026, 9, 10, 10, 0), venerdi2320)).toBe("scade domani");
    expect(scadenzaFattura(Date.UTC(2026, 9, 8, 10, 0), venerdi2320)).toBe("scaduta da 1 giorno");
    expect(scadenzaFattura(Date.UTC(2026, 9, 4, 10, 0), venerdi2320)).toBe("scaduta da 5 giorni");
    expect(scadenzaFattura(Date.UTC(2026, 9, 15, 10, 0), venerdi2320)).toBe("scade il 15 ott");
    expect(scadenzaFattura(Date.UTC(2026, 10, 11, 10, 0), venerdi2320)).toBe("scade l'11 nov");
  });
  it("conta il giorno di Roma, non quello UTC: dopo mezzanotte a Roma la scadenza di ieri è passata", () => {
    const sabato0030 = Date.UTC(2026, 9, 9, 22, 30); // sabato 10 ottobre, 00:30 a Roma, ancora venerdì in UTC
    expect(scadenzaFattura(Date.UTC(2026, 9, 9, 10, 0), sabato0030)).toBe("scaduta da 1 giorno");
    expect(scadenzaFattura(Date.UTC(2026, 9, 9, 22, 10), venerdi2320)).toBe("scade domani"); // 00:10 di sabato a Roma
  });
});

describe("formati dei Numeri", () => {
  it("mesi recenti sul fuso di Roma, a cavallo dell'anno", () => {
    expect(mesiRecenti(Date.UTC(2026, 0, 10), 2)).toEqual([{ valore: "2026-01", etichetta: "gennaio 2026" }, { valore: "2025-12", etichetta: "dicembre 2025" }]);
    // 23:30 UTC del 31 ottobre è già il 1 novembre a Roma.
    expect(mesiRecenti(Date.UTC(2026, 9, 31, 23, 30), 1)[0].valore).toBe("2026-11");
  });
  it("percentuale o n.d.", () => {
    expect(percentualeOppureNd(null)).toBe("n.d.");
    expect(percentualeOppureNd(78)).toBe("78%");
  });
  it("euro con due decimali da centesimi interi", () => {
    expect(euroCentesimi(3_800)).toBe("€ 38,00");
    expect(euroCentesimi(123_450)).toBe("€ 1.234,50");
    expect(euroCentesimi(5)).toBe("€ 0,05");
  });
  it("importo scritto a mano in centesimi", () => {
    expect(centesimiDaTesto("532")).toBe(53_200);
    expect(centesimiDaTesto("532,4")).toBe(53_240);
    expect(centesimiDaTesto("1.234,50")).toBe(123_450);
    expect(centesimiDaTesto("1.234")).toBe(123_400);
    expect(centesimiDaTesto("12.5")).toBe(1_250);
    expect(centesimiDaTesto("€ 0,10")).toBe(10);
    expect(centesimiDaTesto("")).toBeNull();
    expect(centesimiDaTesto("-3")).toBeNull();
    expect(centesimiDaTesto("12,345")).toBeNull();
    expect(centesimiDaTesto("dieci")).toBeNull();
  });
});

describe("euro", () => {
  it("niente meno davanti allo zero", () => {
    expect(euro(-10)).toBe("€ 0");
    expect(euro(-150_000)).toBe("-€ 1.500");
  });
});

describe("ilGiorno", () => {
  it("elisione davanti a 8 e 11", () => {
    expect(ilGiorno(Date.UTC(2026, 9, 8, 10), ORA)).toBe("l'8 ott");
    expect(ilGiorno(Date.UTC(2026, 10, 11, 10), ORA, "dal")).toBe("dall'11 nov");
    expect(ilGiorno(Date.UTC(2026, 9, 15, 10), ORA, "al")).toBe("al 15 ott");
    expect(ilGiorno(Date.UTC(2026, 9, 15, 10), ORA)).toBe("il 15 ott");
  });
});
