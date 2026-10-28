import type { Stage } from "../src/types";
import type { RigaLead } from "../src/pagine/commerciale/tabellaLead";

// Dati condivisi dalle prove della corsia C (tabella dei lead e Oggi).
export const ORA = Date.UTC(2026, 9, 28, 9, 0);
export const ORE = 3_600_000;
export const GIORNO = 86_400_000;

const fase = (id: string, label: string, sortOrder: number, kind: Stage["kind"] = "open", requiresReason = false): Stage =>
  ({ id, label, sortOrder, kind, tone: "neutral", requiresReason, probability: 10, suggestedNextAction: null, suggestedDelayHours: null });
export const FASI: Stage[] = [
  fase("da-chiamare-prima-volta", "Nuovo, da chiamare", 10),
  fase("da-richiamare", "Da richiamare", 20),
  fase("appuntamento-confermato", "Consulenza fissata", 30),
  fase("in-attesa-preventivo", "In attesa preventivo", 40),
  fase("presentazione-confermata", "Presentazione fissata", 50),
  fase("in-attesa-decisione", "In attesa decisione", 60),
  fase("chiuso", "Cliente", 70, "won"),
  fase("non-chiuso", "Non interessato", 80, "lost", true),
  fase("fake", "Non profilato", 90, "lost", true),
];

export function riga(id: string, extra: Partial<RigaLead> & { stato?: "scaduto" | "oggi" | "futuro" | null; scadenza?: number | null; azione?: string | null } = {}): RigaLead {
  const { stato = "futuro", scadenza = ORA + GIORNO, azione = "Richiama Marco, tentativo 2 di 5", ...resto } = extra;
  const chiuso = ["chiuso", "non-chiuso", "fake"].includes(resto.stageId ?? "");
  return {
    id, company: `Officina ${id}`, contactName: "Luca Prova", email: `${id}@esempio.it`, phone: "+39 333 1234567", source: "meta",
    metaCampaign: "Lavoro ripetuto", metaStatus: null, stageId: "da-richiamare", stageChangedAt: ORA - GIORNO, estimatedValue: null,
    ownerId: "tommaso", nextAction: null, nextActionAt: null, appointmentAt: null, duplicateOfId: null, createdAt: ORA - 3 * GIORNO,
    updatedAt: ORA, deletedAt: null, attemptCount: 1, score: "verde", setupCents: null, feeCents: null, sequenceStep: 0, ultimoContatto: ORA - 2 * GIORNO,
    prossima: {
      azione: chiuso ? null : azione, scadenza: chiuso ? null : scadenza, stato: chiuso ? null : stato,
      pulsante: chiuso ? null : { testo: "Chiama Luca", codice: "chiama" }, secondarie: [{ testo: "Segna l'esito", codice: "segna_esito" }],
      responsabile: null, poi: null, tentativo: 2, massimoTentativi: 5,
    },
    ...resto,
  };
}
