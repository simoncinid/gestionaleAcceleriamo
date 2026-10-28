import { describe, expect, it } from "vitest";
import { daRoma } from "../worker/lib/roma";
import { FASE, FASI_APERTE, prossimaAzione, statoScadenza, type LeadPerProcesso } from "../worker/processo/processo";

// Contratto blocco 1, sezione 2: una prova per ogni riga della tabella delle fasi.
const ADESSO = daRoma(2026, 10, 28, 11, 0); // mercoledì
const ORA = 3_600_000;
const GIORNO = 24 * ORA;
const lead = (stageId: string, extra: Partial<LeadPerProcesso> = {}): LeadPerProcesso => ({
  stageId, company: "Officina Bullonetti", contactName: "Marco Rossi", createdAt: ADESSO - ORA, stageChangedAt: ADESSO - ORA,
  nextAction: "x", nextActionAt: ADESSO + 2 * GIORNO, attemptCount: 0, pausedUntil: null, ...extra,
});

describe("prossimaAzione: una riga per fase", () => {
  it("10 Nuovo: prima chiamata, Chiama Marco, tentativo 1, responsabile chi chiama", () => {
    const p = prossimaAzione(lead(FASE.nuovo, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(p.azione).toBe("Prima chiamata");
    expect(p.pulsante).toEqual({ testo: "Chiama Marco", codice: "chiama" });
    expect(p.tentativo).toBe(1);
    expect(p.responsabile).toBe("primaChiamata");
    expect(p.secondarie).toEqual([{ testo: "Segna l'esito", codice: "segna_esito" }, { testo: "Fissa la call di conoscenza", codice: "fissa_conoscenza" }]);
    expect(p.scadenza).toBeTypeOf("number");
  });

  it("20 Da richiamare: tentativo n di 5 con la data salvata, responsabile chi chiama", () => {
    const p = prossimaAzione(lead(FASE.richiamare, { attemptCount: 1 }), ADESSO);
    expect(p.azione).toBe("Richiamare: tentativo 2 di 5");
    expect(p.tentativo).toBe(2);
    expect(p.scadenza).toBe(ADESSO + 2 * GIORNO);
    expect(p.pulsante?.codice).toBe("chiama");
    expect(p.responsabile).toBe("primaChiamata");
  });

  it("30 Conoscenza fissata: prima dell'ora apre la videochiamata, dopo chiede com'è andata, poi l'offerta; Tommaso", () => {
    const prima = prossimaAzione(lead(FASE.conoscenza, { meetLink: "https://meet.example/x" }), ADESSO);
    expect(prima.azione).toBe("Conoscenza con Marco");
    expect(prima.pulsante).toEqual({ testo: "Apri la videochiamata", codice: "apri_videochiamata" });
    // "Non si è presentato" solo dall'ora della call in poi (collaudo di Corrado).
    expect(prima.secondarie.map((s) => s.testo)).toEqual(["Sposta la call"]);
    expect(prima.poi).toMatch(/^Preparare l'offerta entro /);
    expect(prima.tentativo).toBeNull();
    expect(prima.responsabile).toBe("presentazione");
    const telefonica = prossimaAzione(lead(FASE.conoscenza), ADESSO);
    expect(telefonica.pulsante?.testo).toBe("Chiama Marco");
    const dopo = prossimaAzione(lead(FASE.conoscenza, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(dopo.pulsante).toEqual({ testo: "Segna com'è andata la conoscenza", codice: "segna_conoscenza" });
  });

  it("35 In attesa offerta: Prepara l'offerta con la forbice entro 3 giorni lavorativi dalla conoscenza", () => {
    const p = prossimaAzione(lead(FASE.attesaOfferta), ADESSO);
    expect(p.azione).toBe("Prepara l'offerta con la forbice");
    expect(p.pulsante).toEqual({ testo: "Segna l'offerta pronta", codice: "segna_offerta_pronta" });
    expect(p.scadenza).toBe(daRoma(2026, 10, 31, 19, 30)); // conoscenza mercoledì 28: giovedì, venerdì, sabato
    expect(p.poi).toBe("Fissare la call dell'offerta");
    expect(p.responsabile).toBe("presentazione");
  });

  it("35 con proposta (o offerta pronta) e senza call: Fissa la call dell'offerta entro 4 giorni lavorativi", () => {
    for (const extra of [{ haProposta: true }, { nextAction: "Fissare la call dell'offerta" }]) {
      const p = prossimaAzione(lead(FASE.attesaOfferta, { ...extra, offertaAt: null }), ADESSO);
      expect(p.azione).toBe("Fissa la call dell'offerta");
      expect(p.pulsante).toEqual({ testo: "Fissa la call dell'offerta", codice: "fissa_offerta" });
      expect(p.scadenza).toBe(daRoma(2026, 11, 2, 19, 30)); // lunedì: la domenica è chiusa
      expect(p.responsabile).toBe("presentazione");
    }
    // Con la call dell'offerta già fissata la scadenza è il giorno lavorativo prima.
    const fissata = prossimaAzione(lead(FASE.attesaOfferta, { offertaAt: daRoma(2026, 11, 2, 15, 0) }), ADESSO);
    expect(fissata.scadenza).toBe(daRoma(2026, 10, 31, 19, 30));
    expect(fissata.poi).toMatch(/^Offerta /);
  });

  it("40 Offerta fissata: Offerta con Marco, dopo l'ora com'è andata, poi la call di analisi", () => {
    const p = prossimaAzione(lead(FASE.offerta, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(p.azione).toBe("Offerta con Marco");
    expect(p.pulsante).toEqual({ testo: "Segna com'è andata l'offerta", codice: "segna_offerta" });
    expect(p.poi).toBe("Fissare la call di analisi");
    expect(p.responsabile).toBe("presentazione");
    const daFissare = prossimaAzione(lead(FASE.offerta, { nextAction: "Fissare la call di analisi" }), ADESSO);
    expect(daFissare.azione).toBe("Fissa la call di analisi");
    expect(daFissare.pulsante).toEqual({ testo: "Fissa la call di analisi", codice: "fissa_analisi" });
    expect(daFissare.scadenza).toBe(ADESSO + 2 * GIORNO);
  });

  it("45 Analisi fissata: Fai l'analisi con Marco, poi il progetto entro 3 giorni lavorativi", () => {
    const prima = prossimaAzione(lead(FASE.analisi), ADESSO);
    expect(prima.azione).toBe("Fai l'analisi con Marco");
    expect(prima.poi).toMatch(/^Preparare il progetto entro /);
    expect(prima.secondarie.map((s) => s.testo)).toEqual(["Sposta la call"]);
    expect(prima.responsabile).toBe("presentazione");
    const dopo = prossimaAzione(lead(FASE.analisi, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(dopo.pulsante).toEqual({ testo: "Segna com'è andata l'analisi", codice: "segna_analisi" });
  });

  it("50 In attesa progetto: Prepara il progetto entro 3 giorni lavorativi; a progetto pronto Fissa la call del progetto entro 4", () => {
    const p = prossimaAzione(lead(FASE.attesaProgetto), ADESSO);
    expect(p.azione).toBe("Prepara il progetto");
    expect(p.pulsante).toEqual({ testo: "Segna il progetto pronto", codice: "segna_progetto_pronto" });
    expect(p.scadenza).toBe(daRoma(2026, 10, 31, 19, 30));
    expect(p.poi).toBe("Fissare la call del progetto");
    expect(p.responsabile).toBe("presentazione");
    const pronto = prossimaAzione(lead(FASE.attesaProgetto, { nextAction: "Fissare la call del progetto" }), ADESSO);
    expect(pronto.azione).toBe("Fissa la call del progetto");
    expect(pronto.pulsante).toEqual({ testo: "Fissa la call del progetto", codice: "fissa_progetto" });
    expect(pronto.scadenza).toBe(daRoma(2026, 11, 2, 19, 30));
  });

  it("55 Progetto fissato: Presenta il progetto e chiudi, poi la decisione", () => {
    const p = prossimaAzione(lead(FASE.progetto, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(p.azione).toBe("Presenta il progetto e chiudi");
    expect(p.pulsante).toEqual({ testo: "Segna com'è andata la call del progetto", codice: "segna_progetto" });
    expect(p.poi).toBe("Sentire Marco per la decisione");
    expect(p.responsabile).toBe("presentazione");
    expect(p.secondarie.map((s) => s.testo)).toEqual(["Sposta la call", "Non si è presentato"]);
  });

  it("no-show uguale nelle quattro fasi con call: prima assenza Rifissare la call di quel tipo", () => {
    const attese: [string, string, string][] = [
      [FASE.conoscenza, "Rifissare la conoscenza", "fissa_conoscenza"],
      [FASE.offerta, "Rifissare l'offerta", "fissa_offerta"],
      [FASE.analisi, "Rifissare l'analisi", "fissa_analisi"],
      [FASE.progetto, "Rifissare la call del progetto", "fissa_progetto"],
    ];
    for (const [fase, azione, codice] of attese) {
      const p = prossimaAzione(lead(fase, { noShow: 1, nextAction: "Rifissare la call" }), ADESSO);
      expect(p.azione, fase).toBe(azione);
      expect(p.pulsante?.codice, fase).toBe(codice);
    }
  });

  it("60 In attesa decisione: Sentire Marco, Chiama, secondarie Segna la decisione e Rimanda", () => {
    const p = prossimaAzione(lead(FASE.decisione), ADESSO);
    expect(p.azione).toBe("Sentire Marco per la decisione");
    expect(p.pulsante?.testo).toBe("Chiama Marco");
    expect(p.secondarie.map((s) => s.testo)).toEqual(["Segna la decisione", "Rimanda"]);
  });

  it("70 Cliente: nessuna scadenza, Apri il cliente", () => {
    const p = prossimaAzione(lead(FASE.cliente), ADESSO);
    expect(p).toMatchObject({ azione: null, scadenza: null, pulsante: { testo: "Apri il cliente" } });
  });

  it("80 e 90: nessuna azione, Riapri secondario", () => {
    for (const f of [FASE.perso, FASE.nonProfilato]) {
      const p = prossimaAzione(lead(f), ADESSO);
      expect(p).toMatchObject({ azione: null, scadenza: null, pulsante: null, responsabile: null });
      expect(p.secondarie.map((s) => s.testo)).toEqual(["Riapri"]);
    }
  });

  it("invariante: ogni fase aperta ha azione e scadenza anche senza data salvata", () => {
    for (const f of FASI_APERTE) {
      const p = prossimaAzione(lead(f, { nextActionAt: null }), ADESSO);
      expect(p.azione, f).toBeTruthy();
      expect(p.scadenza, f).toBeTypeOf("number");
      expect(p.pulsante, f).not.toBeNull();
    }
  });
});

describe("statoScadenza", () => {
  it("rosso solo oltre un giorno, arancione entro oggi, grigio dopo", () => {
    expect(statoScadenza(ADESSO - 2 * GIORNO, ADESSO)).toBe("scaduto");
    expect(statoScadenza(ADESSO - 3 * ORA, ADESSO)).toBe("oggi");
    expect(statoScadenza(ADESSO + 3 * ORA, ADESSO)).toBe("oggi");
    expect(statoScadenza(ADESSO + GIORNO, ADESSO)).toBe("futuro");
    expect(statoScadenza(null, ADESSO)).toBeNull();
  });
});

describe("scadenze e orario di lavoro (modifica 2)", () => {
  it("un lead arrivato alle 20:00 scade alle 09:00 del giorno lavorativo dopo", () => {
    const sera = daRoma(2026, 10, 28, 20, 0);
    const p = prossimaAzione(lead(FASE.nuovo, { createdAt: sera, stageChangedAt: sera, nextActionAt: sera }), sera);
    expect(p.scadenza).toBe(daRoma(2026, 10, 29, 9, 0));
  });
  it("sabato sera salta la domenica chiusa: lunedì alle 09:00", () => {
    const sabato = daRoma(2026, 10, 31, 21, 0);
    expect(prossimaAzione(lead(FASE.nuovo, { createdAt: sabato, nextActionAt: sabato }), sabato).scadenza).toBe(daRoma(2026, 11, 2, 9, 0));
  });
  it("in orario la prima chiamata scade dopo 30 minuti", () => {
    expect(prossimaAzione(lead(FASE.nuovo, { createdAt: ADESSO, nextActionAt: ADESSO }), ADESSO).scadenza).toBe(ADESSO + 30 * 60_000);
  });
});
