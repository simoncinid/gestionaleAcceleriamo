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
    expect(p.secondarie.map((s) => s.testo)).toEqual(["Segna l'esito", "Fissa una consulenza"]);
    expect(p.scadenza).toBeTypeOf("number");
  });

  it("20 Da richiamare: tentativo n di 5 con la data salvata", () => {
    const p = prossimaAzione(lead(FASE.richiamare, { attemptCount: 1 }), ADESSO);
    expect(p.azione).toBe("Richiamare: tentativo 2 di 5");
    expect(p.tentativo).toBe(2);
    expect(p.scadenza).toBe(ADESSO + 2 * GIORNO);
    expect(p.pulsante?.codice).toBe("chiama");
  });

  it("30 Consulenza fissata: prima dell'ora apre la videochiamata, dopo chiede com'è andata", () => {
    const prima = prossimaAzione(lead(FASE.consulenza, { meetLink: "https://meet.example/x" }), ADESSO);
    expect(prima.azione).toBe("Consulenza con Marco");
    expect(prima.pulsante).toEqual({ testo: "Apri la videochiamata", codice: "apri_videochiamata" });
    expect(prima.secondarie.map((s) => s.testo)).toEqual(["Sposta la call", "Non si è presentato"]);
    expect(prima.poi).toMatch(/^Preparare il preventivo entro /);
    expect(prima.tentativo).toBeNull();
    const telefonica = prossimaAzione(lead(FASE.consulenza), ADESSO);
    expect(telefonica.pulsante?.testo).toBe("Chiama Marco");
    const dopo = prossimaAzione(lead(FASE.consulenza, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(dopo.pulsante).toEqual({ testo: "Segna com'è andata la consulenza", codice: "segna_consulenza" });
  });

  it("40 In attesa preventivo: Segna il preventivo pronto, Tommaso; con proposta e senza data: Fissare la presentazione, Diego", () => {
    const p = prossimaAzione(lead(FASE.preventivo), ADESSO);
    expect(p.azione).toBe("Preparare il preventivo");
    expect(p.pulsante?.testo).toBe("Segna il preventivo pronto");
    expect(p.responsabile).toBe("presentazione");
    const pronto = prossimaAzione(lead(FASE.preventivo, { haProposta: true, presentazioneAt: null }), ADESSO);
    expect(pronto.azione).toBe("Fissare la presentazione");
    expect(pronto.responsabile).toBe("primaChiamata");
    // Con la presentazione già fissata la scadenza è il giorno lavorativo prima.
    const fissata = prossimaAzione(lead(FASE.preventivo, { presentazioneAt: daRoma(2026, 11, 2, 15, 0) }), ADESSO);
    expect(fissata.scadenza).toBe(daRoma(2026, 10, 31, 19, 30)); // sabato è lavorativo nell'orario di base
  });

  it("50 Presentazione fissata: come la 30, poi la decisione", () => {
    const p = prossimaAzione(lead(FASE.presentazione, { nextActionAt: ADESSO - ORA }), ADESSO);
    expect(p.azione).toBe("Presentazione con Marco");
    expect(p.pulsante?.testo).toBe("Segna com'è andata la presentazione");
    expect(p.poi).toBe("Sentire Marco per la decisione");
    expect(p.responsabile).toBe("presentazione");
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
