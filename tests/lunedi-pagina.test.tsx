import { describe, expect, it } from "vitest";
import { Diario } from "../src/pagine/commerciale/Diario";
import { Lunedi } from "../src/pagine/commerciale/Lunedi";
import { Oggi } from "../src/pagine/commerciale/Oggi";
import { daRoma } from "../worker/lib/roma";
import { contaPrimari, render } from "./render";

const numeri = {
  da: Date.UTC(2026, 9, 4, 22), a: Date.UTC(2026, 9, 11, 22), arrivati: 7, perFonte: [{ source: "meta", n: 5 }, { source: "foglio_andrea", n: 2 }],
  costoPerLeadCents: 4_100, conoscenza: 4, presentazione: 2, proposte: 3, vinti: 1,
  fermi: [{ id: "L1", company: "Idraulica Lupi", giorni: 9 }], proposteFerme: [{ id: "P1", leadId: "L2", company: "Studio Vanni", giorni: 15 }],
  ricorrenteCents: 165_000, obiettivoCents: 200_000, spesaAdsMeseCents: 15_000,
};
const revisione = { id: "R1", settimana: "2026-10-05", numeri, decisioni: ["", "", ""], commento: null, commentoStato: "nessuno", chiusaDa: null, chiusaAt: null };

describe("Lunedì e Diario", () => {
  it("Lunedì: numeri, fermi, soldi, tre decisioni, un solo primario", () => {
    const html = render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], revisione]] });
    for (const t of ["Numeri della settimana", "Idraulica Lupi", "fermo da 9 giorni", "Studio Vanni", "Ricorrente firmato", "Decisione 1", "Scrivi il commento", "Chiudi la revisione"]) expect(html).toContain(t);
    expect(contaPrimari(html)).toBe(1);
  });
  it("Lunedì chiusa: nessun primario, chi l'ha chiusa", () => {
    const html = render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], { ...revisione, chiusaDa: "diego", chiusaAt: Date.UTC(2026, 9, 12, 9) }], [["users"], [{ id: "diego", name: "Diego Simoncini" }]]] });
    expect(html).toContain("Chiusa da Diego Simoncini");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Diario: sola lettura, voci per giorno", () => {
    const voci = [{ id: "A1", at: Date.UTC(2026, 9, 10, 7, 12), chi: "Diego Simoncini", testo: "Esito: Officina Bertini", dettaglio: "richiamare", area: "commerciale", href: "/commerciale/lead/L1" }];
    const html = render(<Diario />, { percorso: "/commerciale/oggi/diario", dati: [[["diario", "tutti", "tutte"], { pages: [{ voci, prossimo: null }], pageParams: [null] }], [["users"], []]] });
    expect(html).toContain("Officina Bertini");
    expect(html).toContain("Diego Simoncini");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Lunedì: commento in coda, niente pulsante del commento; commento pronto come testo", () => {
    const coda = render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], { ...revisione, commentoStato: "in_coda" }]] });
    expect(coda).toContain("Claude scrive il commento");
    expect(coda).not.toContain("Scrivi il commento");
    const pronto = render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], { ...revisione, commento: "<b>Bene</b>", commentoStato: "pronto" }]] });
    expect(pronto).toContain("&lt;b&gt;Bene&lt;/b&gt;");
    expect(pronto).toContain("Riscrivi il commento");
    expect(contaPrimari(pronto)).toBe(1);
  });
  it("Diario: stato vuoto con i filtri come Selettore", () => {
    const html = render(<Diario />, { percorso: "/commerciale/oggi/diario", dati: [[["diario", "tutti", "tutte"], { pages: [{ voci: [], prossimo: null }], pageParams: [null] }], [["users"], []]] });
    expect(html).toContain("Nessuna voce");
    expect(html).toContain("Chi");
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(3);
    expect(contaPrimari(html)).toBe(0);
  });
  const oggi = { adesso: null, nuovi: [], daFare: [], call: [], proposte: [], fermi: [], finePausa: [], numeri: { leadNuovi: 0, primaRispostaMinuti: null, callSettimana: 0, proposteAperte: 0 }, totale: 0 };
  const conRevisione = (ora: number, r: Record<string, unknown> = revisione) => render(<Oggi ora={ora} />, { percorso: "/commerciale/oggi", dati: [[["today", "mie"], oggi], [["lunedi", "corrente"], r]] });
  it("Oggi: segmenti e banner del lunedì solo fino alle 12 di Roma e solo con la revisione aperta", () => {
    const mattina = conRevisione(daRoma(2026, 10, 12, 11, 30));
    expect(mattina).toContain("La revisione della settimana è pronta");
    expect(mattina).toContain("Diario");
    expect(conRevisione(daRoma(2026, 10, 12, 12, 0))).not.toContain("La revisione della settimana è pronta");
    expect(conRevisione(daRoma(2026, 10, 13, 9, 0))).not.toContain("La revisione della settimana è pronta");
    expect(conRevisione(daRoma(2026, 10, 12, 9, 0), { ...revisione, chiusaAt: 1, chiusaDa: "diego" })).not.toContain("La revisione della settimana è pronta");
  });
});
