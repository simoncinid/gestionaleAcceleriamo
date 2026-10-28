import { MOTIVI_CON_DATA, MOTIVI_CON_TESTO, type CodiceMotivo } from "../../../worker/processo/motivi";
import type { Esito } from "../../../worker/regole/motore";

import { ESITI_PER_FASE } from "../../../worker/leads/esiti-per-fase";
import type { CallKind } from "../../../worker/db/schema";

// Le stesse parole dello storico (worker/leads/esito.ts).
export const ETICHETTE_ESITO: Record<Esito, string> = {
  risposto: "Risposto",
  non_risponde: "Non risponde",
  occupato: "Occupato",
  richiamare: "Richiamare",
  non_interessato: "Non interessato",
  fuori_target: "Non profilato",
  conoscenza_fissata: "Conoscenza fissata",
  conoscenza_fatta: "Conoscenza fatta",
  offerta_pronta: "Offerta pronta",
  offerta_fissata: "Offerta fissata",
  offerta_presentata: "Offerta presentata",
  analisi_fissata: "Analisi fissata",
  analisi_fatta: "Analisi fatta",
  progetto_pronto: "Progetto pronto",
  progetto_fissato: "Progetto fissato",
  progetto_presentato: "Progetto presentato",
};

// Esiti per fase (modifica 25): la copia unica è quella del worker, qui si aggiungono solo le due voci della scheda
// ("firmato" e "rimanda", che aprono il foglio della chiusura e quello del rinvio) e l'ordine con il passo in cima.
export type SceltaEsito = Esito | "firmato" | "rimanda";
export const SCELTE_SPECIALI = ["firmato", "rimanda"] as const;
export const eSpeciale = (e: SceltaEsito | null): e is "firmato" | "rimanda" => e === "firmato" || e === "rimanda";
export { ESITI_PER_FASE };

// Il passo della tabella in cima: in 10 e 20 la conoscenza fissata, in 55 il progetto presentato, in 60 la decisione.
const IN_CIMA: Record<string, SceltaEsito[]> = {
  "da-chiamare-prima-volta": ["conoscenza_fissata"],
  "da-richiamare": ["conoscenza_fissata"],
  "progetto-fissato": ["progetto_presentato", "firmato"],
  "in-attesa-decisione": ["firmato", "non_interessato", "rimanda"],
};
export const esitiPerFase = (stageId: string): SceltaEsito[] => {
  const cima = IN_CIMA[stageId] ?? [];
  return [...cima, ...(ESITI_PER_FASE[stageId] ?? []).filter((e) => !cima.includes(e))];
};

// La stessa scelta si dice in modo diverso secondo la fase: in 60 "Sì, firma" e "No, non firma".
export function etichettaScelta(e: SceltaEsito, stageId: string): string {
  if (e === "firmato") return stageId === "in-attesa-decisione" ? "Sì, firma" : "Ha firmato";
  if (e === "rimanda") return "Rimanda la decisione";
  if (e === "offerta_fissata" && stageId === "in-attesa-preventivo") return "Offerta pronta: fissa la call dell'offerta";
  if (e === "progetto_fissato" && stageId === "in-attesa-progetto") return "Progetto pronto: fissa la call del progetto";
  if (e === "non_interessato" && stageId === "in-attesa-decisione") return "No, non firma";
  return ETICHETTE_ESITO[e];
}

// Esiti che fissano una call nel foglio, e di che tipo. Con "offerta presentata" la call di analisi è facoltativa.
export const CALL_DELL_ESITO: Partial<Record<Esito, CallKind>> = {
  conoscenza_fissata: "conoscenza", offerta_fissata: "offerta", analisi_fissata: "analisi", progetto_fissato: "progetto",
  offerta_presentata: "analisi",
};
const CALL_FACOLTATIVA: Esito[] = ["offerta_presentata"];

// Prossime azioni del selettore: la proposta del motore in cima, poi le più usate.
export const AZIONI_FREQUENTI = ["Richiamare", "WhatsApp: Non ti ho trovato", "Email: Ti ho cercato", "Call di conoscenza", "Preparare l'offerta", "Fissare la call dell'offerta", "Fissare la call di analisi", "Preparare il progetto", "Fissare la call del progetto", "Follow-up preventivo"];
export const opzioniAzione = (proposta: string) =>
  [...new Set([proposta, ...AZIONI_FREQUENTI].filter(Boolean))].map((a) => ({ valore: a, etichetta: a }));

export type StatoEsito = {
  requestId: string; esito: Esito | null; stageId: string; nextAction: string; nextActionAt: number | null;
  lostReason: string | null; lostNote: string; recontactAt: number | null; note: string; callAt: number | null; meetLink: string;
  // Giorno detto dal cliente per "richiamare": vince sulla scadenza di default.
  data: number | null;
};

// Fase, azione e scadenza le calcola il server (corsia A, modifica 12): il foglio dice solo cosa è successo.
export type EsitoBody = {
  requestId: string; esito: Esito; lostReason?: string; lostNote?: string; recontactAt?: number; data?: number;
  note?: string; call?: { kind: CallKind; scheduledAt: number; meetLink: string | null };
};

// email: undefined se chi apre il foglio non la conosce (il server lo dice comunque), null se manca.
export type LeadEsito = { id: string; company: string; contactName: string | null; stageId: string; attemptCount: number; email?: string | null; setupCents?: number | null; feeCents?: number | null };

// Il requestId nasce quando il foglio si apre e resta lo stesso fino alla chiusura: il doppio tocco non duplica.
// "iniziale" arriva da "Applica i suggerimenti" del coach: fase, prossima azione e note già scritte, l'esito resta da scegliere.
export const statoIniziale = (
  requestId: string,
  lead: { stageId: string },
  iniziale?: Partial<Pick<StatoEsito, "stageId" | "nextAction" | "nextActionAt" | "note">>,
): StatoEsito => ({
  requestId, esito: null, stageId: iniziale?.stageId || lead.stageId, nextAction: iniziale?.nextAction ?? "", nextActionAt: iniziale?.nextActionAt ?? null,
  lostReason: null, lostNote: "", recontactAt: null, note: iniziale?.note ?? "", callAt: null, meetLink: "", data: null,
});

// Gli esiti che decidono da soli fase e prossima azione: una call fissata o un lead perso. Con questi vincono le regole
// anche quando il foglio arriva dal coach; con gli altri restano i suggerimenti del coach.
export const ESITI_DELLE_REGOLE: Esito[] = [
  "non_interessato", "fuori_target", "conoscenza_fissata", "conoscenza_fatta", "offerta_pronta", "offerta_fissata", "offerta_presentata",
  "analisi_fissata", "analisi_fatta", "progetto_pronto", "progetto_fissato", "progetto_presentato",
];

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

// Cosa manca al motivo per andare in 80: "non_ora" vuole il giorno del ricontatto, "altro" il testo.
export function mancaMotivo(m: { lostReason: string | null; lostNote: string; recontactAt: number | null }, ora = Date.now()): string | null {
  if (!m.lostReason) return "Scegli il motivo";
  if (MOTIVI_CON_DATA.includes(m.lostReason as CodiceMotivo) && (m.recontactAt == null || m.recontactAt <= ora)) return "Scegli il giorno in cui risentirlo";
  if (MOTIVI_CON_TESTO.includes(m.lostReason as CodiceMotivo) && !m.lostNote.trim()) return "Scrivi il motivo";
  return null;
}

export function validaEsito(s: StatoEsito, motivoObbligatorio: boolean, ora = Date.now()): string | null {
  if (!s.esito) return "Scegli un esito";
  if (CALL_DELL_ESITO[s.esito] && !CALL_FACOLTATIVA.includes(s.esito) && s.callAt == null) return "Scegli data e ora della call";
  if (motivoObbligatorio) return mancaMotivo(s, ora);
  return null;
}

export function corpoEsito(s: StatoEsito): EsitoBody {
  const corpo: EsitoBody = { requestId: s.requestId, esito: s.esito! };
  if (s.lostReason) corpo.lostReason = s.lostReason;
  if (s.lostReason && s.lostNote.trim()) corpo.lostNote = s.lostNote.trim();
  if (s.lostReason && s.recontactAt != null && MOTIVI_CON_DATA.includes(s.lostReason as CodiceMotivo)) corpo.recontactAt = s.recontactAt;
  if (s.esito === "richiamare" && s.data != null) corpo.data = s.data;
  if (s.note.trim()) corpo.note = s.note.trim();
  const kind = CALL_DELL_ESITO[s.esito!];
  if (kind && s.callAt != null) corpo.call = { kind, scheduledAt: s.callAt, meetLink: s.meetLink.trim() || null };
  return corpo;
}
