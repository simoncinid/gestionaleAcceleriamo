import { describe, expect, it } from "vitest";
import { Numeri } from "../src/pagine/commerciale/Numeri";
import { FoglioSpesa, motivoSpesa } from "../src/pagine/commerciale/numeri/Campagne";
import { durata } from "../src/pagine/commerciale/numeri/Funnel";
import { contaPrimari, render } from "./render";

const funnel = {
  bySource: [], byCampaign: [], byStage: [], firstResponse: { avgMs: 48 * 60_000, count: 30 },
  primaRisposta: { mediaMs: 42 * 60_000, numero: 9 },
  tappe: [
    { chiave: "arrivati", nome: "Lead arrivati", numero: 23, percentuale: 100 },
    { chiave: "sla", nome: "Chiamati entro lo SLA", numero: 18, percentuale: 78 },
    { chiave: "conoscenza", nome: "Call di conoscenza fatte", numero: 9, percentuale: 39 },
    { chiave: "presentazione", nome: "Call di presentazione fatte", numero: 6, percentuale: 26 },
    { chiave: "proposte", nome: "Proposte presentate", numero: 5, percentuale: 22 },
    { chiave: "chiusi", nome: "Clienti chiusi", numero: 2, percentuale: 9 },
  ],
  sla: { percentuale: 78, dentro: 18, totale: 23 },
  tempi: [{ stageId: "da-richiamare", label: "Da richiamare", giorniMedi: 1.5, passaggi: 4 }],
  motivi: [{ id: "budget", etichetta: "Budget", numero: 3 }],
  call: { conoscenza: 9, presentazione: 6, rapporto: 67 },
};
const campagne = {
  mese: "2026-10", soglieCents: [800, 1300, 1600],
  campagne: [{
    campagna: "Automazione preventivi", lead: 14, qualificati: 6, call: 8, proposte: 3, vinti: 2, setupVintoCents: 400_000,
    spesaCents: 53_240, costoPerLeadCents: 3_803, costoPerClienteCents: 26_620, livello: "stop" as const,
    inserzioni: [{ inserzione: "Video 1", lead: 10, qualificati: 4, call: 5, proposte: 2, vinti: 1, setupVintoCents: 200_000 }],
  }],
};
const previsione = { lead: 14, setupTotaleCents: 2_480_000, canoneTotaleCents: 179_000, setupPesatoCents: 940_000, canonePesatoCents: 56_000, ricorrenteCents: 195_000, obiettivoCents: 200_000, fasi: [] };

describe("Numeri a tre segmenti", () => {
  it("Funnel: tappe in righe, n.d. dove manca il campione, nessun primario", () => {
    const html = render(<Numeri />, { percorso: "/commerciale/numeri", dati: [[["numeri", "funnel", "30"], { ...funnel, call: { ...funnel.call, rapporto: null } }]] });
    expect(html).toContain("Dal lead al cliente");
    expect(html).toContain("18 su 23");
    expect(html).toContain("Budget");
    expect(html).toContain("n.d.");
    expect(contaPrimari(html)).toBe(0);
    expect(html).not.toContain("<table");
  });
  it("Funnel: prima risposta della coorte, non quella della 1A, e tempi dei lead arrivati nel periodo", () => {
    const html = render(<Numeri />, { percorso: "/commerciale/numeri", dati: [[["numeri", "funnel", "30"], funnel]] });
    expect(html).toContain("42 min");
    expect(html).toContain("su 9 lead da Meta e dal foglio");
    expect(html).not.toContain("48 min");
    expect(html).toContain("dei lead arrivati nel periodo");
    expect(html).toContain("1,5 giorni");
    // Le barre della quota: SLA, quattro tappe e rapporto delle call; nessuna su "Lead arrivati".
    expect(html.match(/data-barra/g)?.length).toBe(6);
    expect(html).toContain("width:78%");
  });
  it("Funnel: periodo vuoto", () => {
    const vuoto = { ...funnel, tappe: funnel.tappe.map((t) => ({ ...t, numero: 0, percentuale: null })) };
    const html = render(<Numeri />, { percorso: "/commerciale/numeri", dati: [[["numeri", "funnel", "30"], vuoto]] });
    expect(html).toContain("Nessun lead nel periodo");
    expect(html).not.toContain("Dal lead al cliente");
  });
  it("Funnel: caricamento", () => {
    const html = render(<Numeri />, { percorso: "/commerciale/numeri" });
    expect(html).not.toContain("Dal lead al cliente");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Campagne: costo per lead con due decimali, avviso stop loss, inserzione, nessun primario fuori dal foglio", () => {
    const html = render(<Numeri ora={Date.UTC(2026, 9, 15)} />, { percorso: "/commerciale/numeri?vista=campagne", dati: [[["numeri", "campagne", "2026-10"], campagne]] });
    expect(html).toContain("Automazione preventivi");
    expect(html).toContain("Stop loss superato");
    expect(html).toContain("€ 38,03");
    expect(html).toContain("€ 532,40");
    expect(html).toContain("Soglie € 8,00, € 13,00, € 16,00");
    expect(html).toContain("Video 1");
    expect(html).toContain("1 cliente vinto");
    expect(html).toContain("ottobre 2026");
    expect(html).toContain("Scrivi la spesa del mese");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Previsione: se chiudiamo tutto e pesato, ricorrente contro obiettivo con la sola barra arancione", () => {
    const html = render(<Numeri />, { percorso: "/commerciale/numeri?vista=previsione", dati: [[["numeri", "previsione"], previsione]] });
    expect(html).toContain("Se chiudiamo tutto");
    expect(html).toContain("Pesato per probabilità");
    expect(html).toMatch(/1\.950.*su.*2\.000/);
    expect(html.match(/bg-accento/g)?.length).toBe(1);
    expect(html).toContain("width:97.5%");
    expect(contaPrimari(html)).toBe(0);
  });
  it("foglio della spesa: un solo primario, importo già scritto in euro", () => {
    const html = render(<FoglioSpesa mese="2026-10" campagne={campagne.campagne} onChiudi={() => {}} />);
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Salva la spesa");
    expect(html).toContain("Spesa di ottobre 2026");
    expect(html).toContain('value="532,40"');
  });
  it("durata leggibile", () => {
    expect(durata(42 * 60_000)).toBe("42 min");
    expect(durata(3 * 3_600_000)).toBe("3 ore");
    expect(durata(3 * 86_400_000)).toBe("3 giorni");
  });
});

describe("Campagne: rifiniture del Task 14", () => {
  const riga = campagne.campagne[0];
  const due = { ...campagne, campagne: [riga, { ...riga, campagna: "Ricerca clienti", lead: 3, spesaCents: null, costoPerLeadCents: null, costoPerClienteCents: null, livello: "senza_spesa" as const, inserzioni: [] }] };
  const pagina = (dati: unknown) => render(<Numeri ora={Date.UTC(2026, 9, 15)} />, { percorso: "/commerciale/numeri?vista=campagne", dati: [[["numeri", "campagne", "2026-10"], dati]] });
  it("più campagne: righe chiuse con lead e costo per lead, il resto all'apertura", () => {
    const html = pagina(due);
    expect((html.match(/data-campagna=/g) ?? []).length).toBe(2);
    expect((html.match(/data-campagna="[^"]*"[^>]*aria-expanded="false"/g) ?? []).length).toBe(2);
    expect(html).toContain("14 lead");
    expect(html).toContain("Costo per lead € 38,03");
    expect(html).toContain("Spesa da scrivere");
    expect(html).not.toContain("Video 1");
    expect(html).not.toContain("Proposte presentate");
    expect(contaPrimari(html)).toBe(0);
  });
  it("il pulsante della spesa sta subito sotto il selettore del mese", () => {
    const html = pagina(due);
    const mese = html.indexOf('data-selettore="Mese"');
    const spesa = html.indexOf("Scrivi la spesa del mese");
    const prima = html.indexOf('data-campagna="');
    expect(mese).toBeGreaterThan(-1);
    expect(spesa).toBeGreaterThan(mese);
    expect(spesa).toBeLessThan(prima);
  });
  it("mese senza campagne: stato vuoto e spesa scrivibile lo stesso", () => {
    const html = pagina({ ...campagne, campagne: [] });
    expect(html).toContain("Nessun lead da campagne nel mese");
    expect(html).toContain("Scrivi la spesa del mese");
  });
  it("spesa zero: nessuna spesa, niente costo per lead e niente punto verde", () => {
    const zero = { ...riga, spesaCents: 0, costoPerLeadCents: null, costoPerClienteCents: null, livello: "senza_spesa" as const };
    const html = pagina({ ...campagne, campagne: [zero] });
    expect(html).toContain("Nessuna spesa");
    expect(html).not.toContain("€ 0,00");
    expect(html).not.toContain("bg-successo");
  });
  it("nomi lunghi delle inserzioni vanno a capo, il numero resta su una riga", () => {
    const lungo = "Inserzione_con_un_nome_lunghissimo_senza_spazi_che_arriva_da_Meta_e_non_finisce_mai";
    const html = pagina({ ...campagne, campagne: [{ ...riga, inserzioni: [{ ...riga.inserzioni[0], inserzione: lungo }] }] });
    expect(html).toContain(lungo);
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toMatch(/whitespace-nowrap[^"]*"[^>]*>10 lead</);
  });
  it("foglio della spesa: campagna libera se il mese non ne ha", () => {
    const html = render(<FoglioSpesa mese="2026-10" campagne={[]} onChiudi={() => {}} />);
    expect(html).toContain("Nome della campagna");
    expect(html).not.toContain('data-selettore="Campagna"');
    expect(contaPrimari(html)).toBe(1);
  });
  it("foglio della spesa: con le campagne c'è anche \"Un'altra campagna\"", () => {
    const html = render(<FoglioSpesa mese="2026-10" campagne={campagne.campagne} onChiudi={() => {}} />);
    expect(html).toContain('data-selettore="Campagna"');
  });
  it("limite di 100.000 euro anche nel client", () => {
    expect(motivoSpesa("Automazione", "100.000,00")).toBeUndefined();
    expect(motivoSpesa("Automazione", "100.000,01")).toBe("Al massimo € 100.000 al mese");
    expect(motivoSpesa("", "10")).toBe("Scegli la campagna");
    expect(motivoSpesa("Automazione", "")).toBe("Scrivi l'importo");
    expect(motivoSpesa("Automazione", "dieci")).toBe("Scrivi un importo in euro, per esempio 532,40");
  });
});

describe("Previsione a 390 px", () => {
  it("\"€ 1.950 su € 2.000\" resta su una riga", () => {
    const html = render(<Numeri />, { percorso: "/commerciale/numeri?vista=previsione", dati: [[["numeri", "previsione"], previsione]] });
    expect(html).toMatch(/whitespace-nowrap[^"]*"[^>]*>€ 1\.950 su € 2\.000</);
  });
});
