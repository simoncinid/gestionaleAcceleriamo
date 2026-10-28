import type { CallKind } from "../db/schema";

// Q14: fasi che esistono solo con una call fissata. Spostare un lead qui chiede giorno e ora della call:
// la call si crea e la prossima azione diventa la call (stesso effetto di "Fissa call").
// Modifica 25: quattro call, una fase per tipo (30, 40, 45, 55).
export const FASI_CON_CALL = {
  "appuntamento-confermato": "conoscenza",
  "presentazione-confermata": "offerta",
  "analisi-fissata": "analisi",
  "progetto-fissato": "progetto",
} as const satisfies Record<string, CallKind>;

export const CALL_DELL_FASE: Record<CallKind, string> = {
  conoscenza: "appuntamento-confermato", offerta: "presentazione-confermata", analisi: "analisi-fissata", progetto: "progetto-fissato",
};

export function callPerFase(stageId: string | null | undefined): CallKind | null {
  if (!stageId) return null;
  return (FASI_CON_CALL as Record<string, CallKind>)[stageId] ?? null;
}

export const AZIONE_CALL: Record<CallKind, string> = {
  conoscenza: "Call di conoscenza", offerta: "Call dell'offerta", analisi: "Call di analisi", progetto: "Call del progetto",
};

// Codice del pulsante "Fissa la call di..." e tipo di call che apre.
export const CALL_DEL_CODICE: Record<string, CallKind> = {
  fissa_conoscenza: "conoscenza", fissa_offerta: "offerta", fissa_analisi: "analisi", fissa_progetto: "progetto",
};

// Che call è un invito arrivato da Google: la prima non ancora fatta del percorso, almeno quella della fase.
const ORDINE: CallKind[] = ["conoscenza", "offerta", "analisi", "progetto"];
const MINIMA_DELLA_FASE: Record<string, CallKind> = {
  "in-attesa-preventivo": "offerta", "presentazione-confermata": "offerta", "analisi-fissata": "analisi",
  "in-attesa-progetto": "progetto", "progetto-fissato": "progetto", "in-attesa-decisione": "progetto",
};
export function callAttesa(stageId: string, fatte: CallKind[]): CallKind {
  const dopoFatte = Math.max(-1, ...fatte.map((k) => ORDINE.indexOf(k))) + 1;
  const daFase = ORDINE.indexOf(MINIMA_DELLA_FASE[stageId] ?? "conoscenza");
  return ORDINE[Math.min(Math.max(dopoFatte, daFase), ORDINE.length - 1)];
}
