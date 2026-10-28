import type { CallKind } from "../db/schema";
// Forma della risposta di GET /api/leads/:id/collegamenti (contratto blocco 1, sezione 3 "Collegamenti").
// Fissata prima delle corsie: la riempie il worker (modifica 13), la mostra la scheda (modifica 14).
// Si segue clients.originLeadId; nessun campo nuovo sul lead.
export type Collegamenti = {
  proposte: { id: string; number: string; status: "registrata" | "inviata" | "presentata" | "accettata" | "rifiutata" | string; data: number; setupCents: number | null; feeCents: number | null }[];
  call: { id: string; kind: CallKind; scheduledAt: number; outcome: "fatta" | "saltata" | "rimandata" | null }[];
  cliente: { id: string; name: string; dal: number } | null;
  // Vuoti finché il cliente non esiste.
  automazioni: { id: string; name: string; status: string; activatedAt: number | null }[];
  canoni: { id: string; amountCents: number; status: string; billingDay: number; automationId: string | null; automationName: string | null }[];
};

// Riga del contatto in cima a proposta, call, automazione e canone (modifica 16): "<azienda>: Lead, Cliente".
export type RigaContatto = { azienda: string; leadId: string | null; clienteId: string | null };
