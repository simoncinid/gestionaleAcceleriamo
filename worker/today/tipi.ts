import type { ProssimaAzione } from "../processo/processo";

// Riga di "Da fare oggi" (contratto blocco 1, sezione 5): il lead con la sua prossima azione, calcolata dalla stessa
// funzione della tabella e della scheda. meetLink: quello della call di oggi del lead, per "Apri la videochiamata".
export type RigaOggi = {
  id: string; company: string; contactName: string | null; phone: string | null; email: string | null;
  stageId: string; ownerId: string | null; attemptCount: number; setupCents: number | null; feeCents: number | null;
  prossima: ProssimaAzione; meetLink: string | null;
};

export type CallOggi = { id: string; leadId: string; company: string; contactName: string | null; phone: string | null; kind: "conoscenza" | "presentazione"; scheduledAt: number; meetLink: string | null;
  // Spec 6.4: stato della scheda azienda di Claude (ultima versione), mostrato sotto la call di conoscenza.
  scheda: "pronta" | "in_preparazione" | null };

// totale = righe.length: lo stesso numero nel titolo, nel badge del Commerciale e nella tabella filtrata.
export type Oggi = { righe: RigaOggi[]; call: CallOggi[]; totale: number };
