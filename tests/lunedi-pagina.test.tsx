import { describe, expect, it } from "vitest";
import { Diario } from "../src/pagine/commerciale/Diario";
import { fila, Lunedi } from "../src/pagine/commerciale/Lunedi";
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
  const oggi = { righe: [], call: [], totale: 0 };
  const conRevisione = (ora: number, r: Record<string, unknown> = revisione) => render(<Oggi ora={ora} />, { percorso: "/commerciale/oggi", dati: [[["today", "mie"], oggi], [["lunedi", "corrente"], r]] });
  it("Oggi (contratto blocco 1, sezione 5): niente linguette Lunedì e Diario né banner, anche il lunedì mattina", () => {
    const mattina = conRevisione(daRoma(2026, 10, 12, 11, 30));
    expect(mattina).not.toContain("La revisione della settimana è pronta");
    expect(mattina).not.toContain("Diario");
  });
});

describe("Lunedì: voci 23, 25 e 26", () => {
  const pagina = (r: object) => render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], { ...revisione, ...r }]] });
  it("23: con Riscrivi il commento di prima resta, sotto lo stato del nuovo", () => {
    const html = pagina({ commento: "Settimana buona", commentoStato: "in_corso" });
    expect(html).toContain("Nuovo commento in preparazione");
    expect(html).toContain("Commento precedente");
    expect(html).toContain("Settimana buona");
    expect(html.indexOf("Nuovo commento in preparazione")).toBeLessThan(html.indexOf("Settimana buona"));
    const errore = pagina({ commento: "Settimana buona", commentoStato: "errore" });
    expect(errore).toContain("Il nuovo commento non è arrivato: riprova");
    expect(errore).toContain("Riscrivi il commento");
  });
  it("25: al tetto niente pulsante del commento, lo stato lo dice", () => {
    const html = pagina({ commentoStato: "fermo_tetto" });
    expect(html).toContain("Claude è al tetto del mese");
    expect(html).not.toContain("Scrivi il commento");
  });
  it("26: la fila fa partire la chiusura solo dopo il salvataggio in volo", async () => {
    const ordine = fila();
    const visti: string[] = [];
    let sblocca!: () => void;
    const primo = ordine(() => new Promise<void>((ok) => { sblocca = () => { visti.push("decisioni"); ok(); }; }));
    const secondo = ordine(async () => { visti.push("chiusura"); });
    await Promise.resolve();
    expect(visti).toEqual([]);
    sblocca();
    await Promise.all([primo, secondo]);
    expect(visti).toEqual(["decisioni", "chiusura"]);
    await ordine(() => Promise.reject(new Error("409"))).catch(() => undefined);
    await ordine(async () => { visti.push("dopo l'errore"); });
    expect(visti).toContain("dopo l'errore");
  });
});
