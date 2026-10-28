import { describe, expect, it } from "vitest";
import { Lead } from "../src/pagine/commerciale/Lead";
import { FILTRI_BASE, conteggi, filtra, leggiFiltri, ordina, scadenzaBreve, scriviFiltri, titoloLead, trova } from "../src/pagine/commerciale/tabellaLead";
import { FASI, GIORNO, ORA, ORE, riga } from "./b1c-fixture";
import { render } from "./render";

const LEADS = [
  riga("futuro", { scadenza: ORA + GIORNO, stato: "futuro" }),
  riga("vecchio", { scadenza: ORA - 3 * GIORNO, stato: "scaduto", phone: "+39 347 9988776" }),
  riga("consulenza", { scadenza: ORA + 2 * ORE, stato: "oggi", stageId: "appuntamento-confermato", ownerId: "anna" }),
  riga("ieri", { scadenza: ORA - 2 * GIORNO, stato: "scaduto", stageId: "in-attesa-decisione", metaCampaign: "Preventivi" }),
  riga("libero", { scadenza: ORA + 3 * GIORNO, stato: "futuro", ownerId: null }),
  riga("cliente", { stageId: "chiuso" }),
];
const pagina = (percorso: string) =>
  render(<Lead ora={ORA} />, { percorso, dati: [[["leads", "tabella"], LEADS], [["stages"], FASI], [["users"], [{ id: "tommaso", name: "Tommaso" }, { id: "anna", name: "Anna" }]]] });

describe("modifica 19: filtri, ricerca e ordinamento", () => {
  it("Fase: Consulenza fissata mostra solo le consulenze", () => {
    const f = { ...FILTRI_BASE, fasi: ["appuntamento-confermato"] };
    expect(filtra(LEADS, f).map((l) => l.id)).toEqual(["consulenza"]);
  });

  it("Scaduti mostra solo le righe rosse, e il numero è quello del titolo", () => {
    const righe = filtra(LEADS, { ...FILTRI_BASE, seg: "scaduti" });
    expect(righe.every((l) => l.prossima?.stato === "scaduto")).toBe(true);
    expect(righe).toHaveLength(conteggi(LEADS, FILTRI_BASE).scaduti);
  });

  it("Chiusi mostra solo le fasi chiuse", () => {
    expect(filtra(LEADS, { ...FILTRI_BASE, seg: "chiusi" }).map((l) => l.id)).toEqual(["cliente"]);
  });

  it("ricerca per telefono con spazi, per persona e per email", () => {
    expect(filtra(LEADS, { ...FILTRI_BASE, q: "347 998" }).map((l) => l.id)).toEqual(["vecchio"]);
    expect(trova(LEADS[0], "luca")).toBe(true);
    expect(trova(LEADS[0], "futuro@esempio")).toBe(true);
    expect(trova(LEADS[0], "999")).toBe(false);
  });

  it("Responsabile: una persona, oppure Nessuno per i non assegnati", () => {
    expect(filtra(LEADS, { ...FILTRI_BASE, resp: "anna" }).map((l) => l.id)).toEqual(["consulenza"]);
    expect(filtra(LEADS, { ...FILTRI_BASE, resp: "nessuno" }).map((l) => l.id)).toEqual(["libero"]);
    expect(filtra(LEADS, { ...FILTRI_BASE, camp: "Preventivi" }).map((l) => l.id)).toEqual(["ieri"]);
  });

  it("i filtri stanno nell'indirizzo e tornano uguali (la freccia indietro li ritrova)", () => {
    const f = { ...FILTRI_BASE, seg: "scaduti" as const, fasi: ["da-richiamare", "in-attesa-decisione"], resp: "anna", q: "333 12", ord: "azienda" as const, dir: "desc" as const };
    const p = scriviFiltri(f);
    expect(leggiFiltri(new URLSearchParams(p.toString()))).toEqual(f);
    expect(scriviFiltri(FILTRI_BASE).toString()).toBe("");
  });

  it("ordinamento per azienda e per ultimo contatto, nei due versi", () => {
    const aperti = filtra(LEADS, FILTRI_BASE);
    const az = ordina(aperti, { ord: "azienda", dir: "asc" }, FASI).map((l) => l.id);
    expect(az).toEqual([...az].sort((a, b) => `Officina ${a}`.localeCompare(`Officina ${b}`, "it")));
    expect(ordina(aperti, { ord: "azienda", dir: "desc" }, FASI).map((l) => l.id)).toEqual([...az].reverse());
  });

  it("pagina con filtri nell'indirizzo: titolo coerente, intestazione ordinata con freccia", () => {
    const html = pagina("/commerciale/lead?seg=scaduti&ord=azienda&dir=asc");
    const n = conteggi(LEADS, FILTRI_BASE);
    expect(html).toContain(titoloLead(n));
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("Officina vecchio");
    expect(html).not.toContain("Officina futuro");
  });

  it("blocco 1 bis: colonne del foglio, sei visibili di base (Telefono leggibile col link), le altre a scelta", () => {
    const html = pagina("/commerciale/lead");
    for (const t of ["Azienda", "Telefono", "Fase", "Da fare", "Ultimo contatto", "Arrivato il"]) expect(html).toContain(`>${t}<`);
    for (const t of ["Email", "Inserzione", "Settore", "Attività", "Offerta", "Fonte"]) expect(html).not.toContain(`>${t}</th>`);
    expect(html).toContain("+39 347 998 8776");
    expect(html).toContain('href="tel:');
    expect(html).toContain("6 di 12");
  });

  it("la parola scaduta solo sulle righe rosse; stamattina resta oggi", () => {
    expect(scadenzaBreve(ORA - 3 * GIORNO, ORA, "scaduto")).toBe("scaduta da 3 giorni");
    expect(scadenzaBreve(ORA - 2 * ORE, ORA, "oggi")).toMatch(/^oggi \d\d:\d\d$/);
    expect(scadenzaBreve(ORA + GIORNO, ORA, "futuro")).toMatch(/^domani /);
  });

  it("nessun risultato: stato vuoto con Togli i filtri", () => {
    const html = pagina("/commerciale/lead?q=inesistente");
    expect(html).toContain("Nessun lead con questi filtri");
    expect(html).toContain("Togli i filtri");
  });
});
