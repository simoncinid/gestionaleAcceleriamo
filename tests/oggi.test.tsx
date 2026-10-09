import { describe, expect, it, vi } from "vitest";
import { CLASSI_AVVISI } from "../src/avvisi";
import { testoSla } from "../src/format";
import { avviaOrologio } from "../src/hooks";
import { BloccoAdesso } from "../src/pagine/commerciale/BloccoAdesso";
import { Oggi } from "../src/pagine/commerciale/Oggi";
import type { Oggi as DatiOggi, RigaOggi } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const riga = (id: string, extra: Partial<RigaOggi> = {}): RigaOggi => ({
  id, company: `Officina ${id}`, contactName: "Luca Prova", phone: "+393330000001", email: "luca@esempio.it", stageId: "da-richiamare", stageLabel: "Da richiamare",
  nextAction: "Richiamare", nextActionAt: ORA - 3_600_000, stageChangedAt: ORA, ownerId: "tommaso", score: "verde", attemptCount: 1, createdAt: ORA - 86_400_000,
  setupCents: null, feeCents: null, slaScadenza: null, ...extra,
});
const base: DatiOggi = {
  adesso: null, nuovi: [], daFare: [], call: [], proposte: [], fermi: [], finePausa: [],
  numeri: { leadNuovi: 3, primaRispostaMinuti: 42, callSettimana: 2, proposteAperte: 1 }, totale: 0,
};
const pagina = (dati: DatiOggi) => render(<Oggi ora={ORA} />, { percorso: "/commerciale/oggi", dati: [[["today", "mie"], dati]] });

describe("pagina Oggi", () => {
  it("una sola azione primaria: il primo pulsante di Adesso", () => {
    const scaduta = riga("a");
    const html = pagina({
      ...base,
      adesso: { tipo: "lead", ...scaduta },
      nuovi: [riga("n", { stageId: "da-chiamare-prima-volta", stageLabel: "Da chiamare", attemptCount: 0, slaScadenza: ORA + 40 * 60_000 })],
      daFare: [scaduta, riga("b", { nextActionAt: ORA + 3_600_000 })],
      totale: 3,
    });
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Chiama Luca");
    expect(html).toContain("Lead nuovi da chiamare");
    expect(html).toContain("mancano 40 min");
    expect(html).toContain("Da fare");
    expect(html).toMatch(/Oggi[^<]*<[^>]*>3</);
  });

  it("call in Adesso: Apri Meet", () => {
    const html = pagina({ ...base, adesso: { tipo: "call", id: "k", leadId: "a", company: "Officina a", contactName: "Luca", phone: null, kind: "conoscenza", scheduledAt: ORA + 600_000, meetLink: "https://meet.google.com/abc" }, totale: 1 });
    expect(html).toContain("Apri Meet");
    expect(contaPrimari(html)).toBe(1);
  });

  it("niente da fare: stato vuoto e numeri del giorno, una informazione per riga", () => {
    const html = pagina(base);
    expect(html).toContain("Niente da fare adesso");
    expect(html).toContain("Lead nuovi oggi: 3");
    expect(html).toContain("Prima risposta media: 42 min");
    expect(html).toContain("Call questa settimana: 2");
    expect(html).toContain("Proposte aperte: 1");
    expect(contaPrimari(html)).toBe(0);
  });

  it("fermi e fine pausa stanno a scomparsa", () => {
    const html = pagina({ ...base, fermi: [riga("f", { stageChangedAt: ORA - 9 * 86_400_000 })], finePausa: [riga("p")] });
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[^<]*Fermi da 7 giorni/);
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[^<]*Fine pausa/);
  });
});

describe("orologio della pagina e blocco Adesso", () => {
  it("il timer delle 2 ore va avanti da solo: dopo 31 secondi il testo cambia", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ORA);
    const scadenza = ORA + 50_000;
    let ora = Date.now();
    const ferma = avviaOrologio((t) => { ora = t; }, 30_000);
    const prima = testoSla(scadenza, ora);
    vi.advanceTimersByTime(31_000);
    ferma();
    vi.useRealTimers();
    expect(prima).toBe("mancano 1 min");
    expect(testoSla(scadenza, ora)).toBe("mancano 0 min");
    expect(ora).toBe(ORA + 30_000);
  });

  it("un nome lungo non esce dal blocco arancione: l'etichetta si tronca", () => {
    const html = render(<BloccoAdesso voce={{ tipo: "lead", ...riga("a", { contactName: "Massimiliano Rossi" }) }} ora={ORA} onEsito={() => {}} onRimanda={() => {}} />);
    expect(html).toMatch(/<span class="[^"]*truncate[^"]*">Chiama Massimiliano<\/span>/);
    expect(html).toMatch(/<a [^>]*class="[^"]*min-w-0/);
  });
});

describe("avvisi", () => {
  it("successo in accento, avvisi semplici in sabbia, nessun colore scritto a mano", () => {
    expect(CLASSI_AVVISI.success).toContain("bg-accento!");
    expect(CLASSI_AVVISI.success).toContain("text-accento-inchiostro!");
    expect(CLASSI_AVVISI.toast).toContain("bg-sabbia!");
    expect(CLASSI_AVVISI.toast).toContain("text-ink!");
    expect(CLASSI_AVVISI.error).toContain("bg-avorio!");
    expect(JSON.stringify(CLASSI_AVVISI)).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
