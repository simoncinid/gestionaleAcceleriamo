import { describe, expect, it } from "vitest";
import { Fasi } from "../src/pagine/impostazioni/Fasi";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { contaPrimari, render } from "./render";

// Blocco 1, modifiche 4 e 25: Impostazioni > Fasi mostra le dodici fasi con la regola scritta e non le modifica.
const NOVE = [
  ["da-chiamare-prima-volta", "Nuovo, da chiamare", "open"], ["da-richiamare", "Da richiamare", "open"], ["appuntamento-confermato", "Conoscenza fissata", "open"],
  ["in-attesa-preventivo", "In attesa offerta", "open"], ["presentazione-confermata", "Offerta fissata", "open"], ["analisi-fissata", "Analisi fissata", "open"],
  ["in-attesa-progetto", "In attesa progetto", "open"], ["progetto-fissato", "Progetto fissato", "open"], ["in-attesa-decisione", "In attesa decisione", "open"],
  ["chiuso", "Cliente", "won"], ["non-chiuso", "Non interessato", "lost"], ["fake", "Non profilato", "lost"],
].map(([id, label, kind], i) => ({ id, label, kind, sortOrder: (i + 1) * 10, tone: "neutral", requiresReason: false, probability: 10, suggestedNextAction: null, suggestedDelayHours: null }));
const utenti = [{ id: "diego", name: "Diego" }, { id: "tommaso", name: "Tommaso" }];
const pagina = () => render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], NOVE], [["stage-rules"], []], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], utenti]] });

describe("Impostazioni > Fasi in sola lettura", () => {
  it("le dodici fasi con azione, scadenza e chi, senza campi né pulsanti per cambiarle", () => {
    const html = pagina();
    const righe = [...html.matchAll(/<li [^>]*data-fase="([^"]+)"[^>]*>(.*?)<\/li>/gs)];
    expect(righe.map((r) => r[1])).toEqual(NOVE.map((f) => f.id));
    for (const [, , r] of righe) {
      expect(r).toContain("Azione:");
      expect(r).toContain("Scadenza:");
      expect(r).toContain("Chi:");
      expect(r).not.toContain("<input");
      expect(r).not.toContain("<button");
    }
    expect(righe[0][2]).toContain("Prima chiamata");
    expect(righe[0][2]).toContain("30 minuti");
    expect(righe[0][2]).toContain("Chi: Diego");
    expect(html).not.toContain("Azione proposta");
    expect(html).not.toContain(">Riordina<");
    expect(html).not.toContain('data-selettore="Si aggancia a"');
  });

  it("restano modificabili orario, giorni, punteggio e le etichette dei motivi; un solo primario", () => {
    const html = pagina();
    expect(html).toContain("Giorni di lavoro");
    expect(html).toContain("Campo del lead");
    expect(html).toContain(`value="${IMPOSTAZIONI_DEFAULT.motivi[0].etichetta}"`);
    expect(html).not.toContain("Aggiungi un motivo");
    expect(contaPrimari(html)).toBe(1);
    expect(html).not.toMatch(/[–—]/);
  });
});
