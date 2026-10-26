import type { Esito } from "../../../worker/regole/motore";

// Le stesse parole del prototipo e dello storico (worker/leads/esito.ts).
export const ETICHETTE_ESITO: Record<Esito, string> = {
  risposto: "Risposto",
  non_risponde: "Non risponde",
  occupato: "Occupato",
  richiamare: "Richiamare",
  appuntamento: "Consulenza fissata",
  non_interessato: "Non interessato",
  fuori_target: "Non profilato",
  consulenza_fatta: "Consulenza fatta",
  presentazione_fissata: "Presentazione fissata",
  presentazione_fatta: "Presentazione fatta",
};

// Ordine del selettore dell'esito: dal più frequente al più raro, come nel prototipo.
export const ESITI_PER_FREQUENZA: Esito[] = ["non_risponde", "richiamare", "risposto", "appuntamento", "occupato", "non_interessato", "fuori_target"];

// Gli esiti dipendono da dove è il lead nel processo: telefonate prima della consulenza,
// poi consulenza, preventivo e presentazione. Gli esiti di chiusura restano sempre in fondo.
const PERSI: Esito[] = ["non_interessato", "fuori_target"];
const PER_FASE: Record<string, Esito[]> = {
  "appuntamento-confermato": ["consulenza_fatta", "presentazione_fissata", "richiamare", "non_risponde"],
  "in-attesa-preventivo": ["presentazione_fissata", "richiamare", "non_risponde", "risposto"],
  "presentazione-confermata": ["presentazione_fatta", "richiamare", "non_risponde"],
  "in-attesa-decisione": ["risposto", "richiamare", "non_risponde", "presentazione_fissata"],
};
export const esitiPerFase = (stageId: string): Esito[] => [...(PER_FASE[stageId] ?? ESITI_PER_FREQUENZA.filter((e) => !PERSI.includes(e))), ...PERSI];

// Esiti che fissano una call nel foglio, e di che tipo.
export const CALL_DELL_ESITO: Partial<Record<Esito, "conoscenza" | "presentazione">> = { appuntamento: "conoscenza", presentazione_fissata: "presentazione" };

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
  note?: string; call?: { kind: "conoscenza" | "presentazione"; scheduledAt: number; meetLink: string | null };
};

// email: undefined se chi apre il foglio non la conosce (il server lo dice comunque), null se manca.
export type LeadEsito = { id: string; company: string; contactName: string | null; stageId: string; attemptCount: number; email?: string | null };

// Il requestId nasce quando il foglio si apre e resta lo stesso fino alla chiusura: il doppio tocco non duplica.
// "iniziale" arriva da "Applica i suggerimenti" del coach: fase, prossima azione e note già scritte, l'esito resta da scegliere.
export const statoIniziale = (
  requestId: string,
  lead: { stageId: string },
  iniziale?: Partial<Pick<StatoEsito, "stageId" | "nextAction" | "nextActionAt" | "note">>,
): StatoEsito => ({
  requestId, esito: null, stageId: iniziale?.stageId || lead.stageId, nextAction: iniziale?.nextAction ?? "", nextActionAt: iniziale?.nextActionAt ?? null,
  lostReason: null, note: iniziale?.note ?? "", callAt: null, meetLink: "",
});

// Gli esiti che decidono da soli fase e prossima azione: una call fissata o un lead perso. Con questi vincono le regole
// anche quando il foglio arriva dal coach; con gli altri restano i suggerimenti del coach.
export const ESITI_DELLE_REGOLE: Esito[] = ["appuntamento", "non_interessato", "fuori_target", "consulenza_fatta", "presentazione_fissata", "presentazione_fatta"];

// Unisce la proposta delle regole (arrivata dopo la scelta dell'esito) allo stato del foglio.
export function applicaProposta(
  prima: StatoEsito,
  p: { stageId: string | null; nextAction: string | null; nextActionAt: number | null; lostReason?: string | null },
  iniziale?: Partial<Pick<StatoEsito, "stageId" | "nextAction" | "nextActionAt" | "note">>,
): StatoEsito {
  const lostReason = p.lostReason ?? null;
  if (!iniziale || (prima.esito && ESITI_DELLE_REGOLE.includes(prima.esito))) {
    return { ...prima, stageId: p.stageId ?? prima.stageId, nextAction: p.nextAction ?? "", nextActionAt: p.nextActionAt, lostReason };
  }
  return {
    ...prima,
    stageId: iniziale.stageId || (p.stageId ?? prima.stageId),
    nextAction: iniziale.nextAction ?? "",
    nextActionAt: iniziale.nextActionAt ?? null,
    lostReason,
  };
}

export const testoTentativo = (attemptCount: number, massimo = 5) => `Tentativo ${Math.min(attemptCount + 1, massimo)} di ${massimo}`;

export function validaEsito(s: StatoEsito, motivoObbligatorio: boolean): string | null {
  if (!s.esito) return "Scegli un esito";
  if (CALL_DELL_ESITO[s.esito] && s.callAt == null) return "Scegli data e ora della call";
  if (motivoObbligatorio && !s.lostReason) return "Scegli il motivo";
  return null;
}

export function corpoEsito(s: StatoEsito): EsitoBody {
  const corpo: EsitoBody = {
    requestId: s.requestId, esito: s.esito!, stageId: s.stageId,
    nextAction: s.nextAction.trim() || null, nextActionAt: s.nextActionAt, lostReason: s.lostReason,
  };
  if (s.note.trim()) corpo.note = s.note.trim();
  const kind = CALL_DELL_ESITO[s.esito!];
  if (kind && s.callAt != null) corpo.call = { kind, scheduledAt: s.callAt, meetLink: s.meetLink.trim() || null };
  return corpo;
}
