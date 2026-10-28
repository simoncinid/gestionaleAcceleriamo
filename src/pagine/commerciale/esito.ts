import { MOTIVI_CON_DATA, MOTIVI_CON_TESTO, type CodiceMotivo } from "../../../worker/processo/motivi";
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

// Esiti per fase, dalla tabella del contratto (blocco 1, sezione 2). Prima della consulenza (10, 20) le telefonate;
// in 30 com'è andata la consulenza; in 40 il preventivo pronto; in 50 la presentazione; in 60 la decisione.
// "firmato" e "rimanda" non sono esiti del motore: aprono il foglio della chiusura e quello del rinvio.
export type SceltaEsito = Esito | "firmato" | "rimanda";
export const SCELTE_SPECIALI = ["firmato", "rimanda"] as const;
export const eSpeciale = (e: SceltaEsito | null): e is "firmato" | "rimanda" => e === "firmato" || e === "rimanda";

const TELEFONATE: SceltaEsito[] = ["appuntamento", "non_risponde", "occupato", "richiamare", "non_interessato", "fuori_target"];
const PER_FASE: Record<string, SceltaEsito[]> = {
  "da-chiamare-prima-volta": TELEFONATE,
  "da-richiamare": TELEFONATE,
  "appuntamento-confermato": ["consulenza_fatta", "non_interessato", "fuori_target"],
  "in-attesa-preventivo": ["presentazione_fissata", "non_interessato"],
  "presentazione-confermata": ["presentazione_fatta", "firmato", "non_interessato"],
  "in-attesa-decisione": ["firmato", "non_interessato", "rimanda"],
};
export const esitiPerFase = (stageId: string): SceltaEsito[] => PER_FASE[stageId] ?? TELEFONATE;

// La stessa scelta si dice in modo diverso secondo la fase: in 60 "Sì, firma" e "No, non firma".
export function etichettaScelta(e: SceltaEsito, stageId: string): string {
  if (e === "firmato") return stageId === "in-attesa-decisione" ? "Sì, firma" : "Ha firmato";
  if (e === "rimanda") return "Rimanda la decisione";
  if (e === "presentazione_fissata" && stageId === "in-attesa-preventivo") return "Preventivo pronto: fissa la presentazione";
  if (e === "non_interessato" && stageId === "in-attesa-decisione") return "No, non firma";
  return ETICHETTE_ESITO[e];
}

// Esiti che fissano una call nel foglio, e di che tipo.
export const CALL_DELL_ESITO: Partial<Record<Esito, "conoscenza" | "presentazione">> = { appuntamento: "conoscenza", presentazione_fissata: "presentazione" };

// Prossime azioni del selettore: la proposta del motore in cima, poi le più usate.
export const AZIONI_FREQUENTI = ["Richiamare", "WhatsApp: Non ti ho trovato", "Email: Ti ho cercato", "Call di conoscenza", "Preparare il preventivo", "Fissare la call di presentazione", "Follow-up preventivo"];
export const opzioniAzione = (proposta: string) =>
  [...new Set([proposta, ...AZIONI_FREQUENTI].filter(Boolean))].map((a) => ({ valore: a, etichetta: a }));

export type StatoEsito = {
  requestId: string; esito: Esito | null; stageId: string; nextAction: string; nextActionAt: number | null;
  lostReason: string | null; lostNote: string; recontactAt: number | null; note: string; callAt: number | null; meetLink: string;
};

export type EsitoBody = {
  requestId: string; esito: Esito; stageId: string; nextAction: string | null; nextActionAt: number | null; lostReason: string | null;
  lostNote?: string; recontactAt?: number;
  note?: string; call?: { kind: "conoscenza" | "presentazione"; scheduledAt: number; meetLink: string | null };
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
  lostReason: null, lostNote: "", recontactAt: null, note: iniziale?.note ?? "", callAt: null, meetLink: "",
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

// Cosa manca al motivo per andare in 80: "non_ora" vuole il giorno del ricontatto, "altro" il testo.
export function mancaMotivo(m: { lostReason: string | null; lostNote: string; recontactAt: number | null }, ora = Date.now()): string | null {
  if (!m.lostReason) return "Scegli il motivo";
  if (MOTIVI_CON_DATA.includes(m.lostReason as CodiceMotivo) && (m.recontactAt == null || m.recontactAt <= ora)) return "Scegli il giorno in cui risentirlo";
  if (MOTIVI_CON_TESTO.includes(m.lostReason as CodiceMotivo) && !m.lostNote.trim()) return "Scrivi il motivo";
  return null;
}

export function validaEsito(s: StatoEsito, motivoObbligatorio: boolean, ora = Date.now()): string | null {
  if (!s.esito) return "Scegli un esito";
  if (CALL_DELL_ESITO[s.esito] && s.callAt == null) return "Scegli data e ora della call";
  if (motivoObbligatorio) return mancaMotivo(s, ora);
  return null;
}

export function corpoEsito(s: StatoEsito): EsitoBody {
  const corpo: EsitoBody = {
    requestId: s.requestId, esito: s.esito!, stageId: s.stageId,
    nextAction: s.nextAction.trim() || null, nextActionAt: s.nextActionAt, lostReason: s.lostReason,
  };
  if (s.lostReason && s.lostNote.trim()) corpo.lostNote = s.lostNote.trim();
  if (s.lostReason && s.recontactAt != null && MOTIVI_CON_DATA.includes(s.lostReason as CodiceMotivo)) corpo.recontactAt = s.recontactAt;
  if (s.note.trim()) corpo.note = s.note.trim();
  const kind = CALL_DELL_ESITO[s.esito!];
  if (kind && s.callAt != null) corpo.call = { kind, scheduledAt: s.callAt, meetLink: s.meetLink.trim() || null };
  return corpo;
}
