import type { Esito } from "../../../worker/regole/motore";

// Le stesse parole del prototipo e dello storico (worker/leads/esito.ts).
export const ETICHETTE_ESITO: Record<Esito, string> = {
  risposto: "Risposto",
  non_risponde: "Non risponde",
  occupato: "Occupato",
  richiamare: "Richiamare",
  appuntamento: "Appuntamento fissato",
  non_interessato: "Non interessato",
  fuori_target: "Fuori target",
};

// Ordine del selettore dell'esito: dal più frequente al più raro, come nel prototipo.
export const ESITI_PER_FREQUENZA: Esito[] = ["non_risponde", "richiamare", "risposto", "appuntamento", "occupato", "non_interessato", "fuori_target"];

// Prossime azioni del selettore: la proposta del motore in cima, poi le più usate.
export const AZIONI_FREQUENTI = ["Richiamare", "WhatsApp: Non ti ho trovato", "Email: Ti ho cercato", "Call di conoscenza", "Preparare il preventivo", "Fissare la call di presentazione", "Follow-up preventivo"];
export const opzioniAzione = (proposta: string) =>
  [...new Set([proposta, ...AZIONI_FREQUENTI].filter(Boolean))].map((a) => ({ valore: a, etichetta: a }));

export type StatoEsito = {
  requestId: string; esito: Esito | null; stageId: string; nextAction: string; nextActionAt: number | null;
  lostReason: string | null; note: string; callAt: number | null; meetLink: string;
};

export type EsitoBody = {
  requestId: string; esito: Esito; stageId: string; nextAction: string | null; nextActionAt: number | null; lostReason: string | null;
  note?: string; call?: { kind: "conoscenza"; scheduledAt: number; meetLink: string | null };
};

// Il requestId nasce quando il foglio si apre e resta lo stesso fino alla chiusura: il doppio tocco non duplica.
export const statoIniziale = (requestId: string, lead: { stageId: string }): StatoEsito => ({
  requestId, esito: null, stageId: lead.stageId, nextAction: "", nextActionAt: null, lostReason: null, note: "", callAt: null, meetLink: "",
});

export const testoTentativo = (attemptCount: number, massimo = 5) => `Tentativo ${Math.min(attemptCount + 1, massimo)} di ${massimo}`;

export function validaEsito(s: StatoEsito, motivoObbligatorio: boolean): string | null {
  if (!s.esito) return "Scegli un esito";
  if (s.esito === "appuntamento" && s.callAt == null) return "Scegli data e ora della call";
  if (motivoObbligatorio && !s.lostReason) return "Scegli il motivo";
  return null;
}

export function corpoEsito(s: StatoEsito): EsitoBody {
  const corpo: EsitoBody = {
    requestId: s.requestId, esito: s.esito!, stageId: s.stageId,
    nextAction: s.nextAction.trim() || null, nextActionAt: s.nextActionAt, lostReason: s.lostReason,
  };
  if (s.note.trim()) corpo.note = s.note.trim();
  if (s.esito === "appuntamento" && s.callAt != null) corpo.call = { kind: "conoscenza", scheduledAt: s.callAt, meetLink: s.meetLink.trim() || null };
  return corpo;
}
