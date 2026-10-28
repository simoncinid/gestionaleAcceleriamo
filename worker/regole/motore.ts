import { ORARIO_DEFAULT, type Orario } from "./orario";
import { AZIONE_PAUSA, transizione, type Evento as EventoTransizione, type LeadTransizione } from "../processo/transizione";

// Le regole propongono, le persone salvano (spec 6.3). Qui solo funzioni pure.

// Percorso a cinque chiamate (modifica 25): qualifica al telefono, poi conoscenza, offerta, analisi e progetto.
export const ESITI = [
  "risposto", "non_risponde", "occupato", "richiamare", "non_interessato", "fuori_target",
  "conoscenza_fissata", "conoscenza_fatta", "offerta_pronta", "offerta_fissata", "offerta_presentata",
  "analisi_fissata", "analisi_fatta", "progetto_pronto", "progetto_fissato", "progetto_presentato",
] as const;
export type Esito = (typeof ESITI)[number];

export type Contesto = { ora: number; orario: Orario; sequenze: boolean; ricontatti: number[]; pausaMesi: number; oreProposta: number; massimoTentativi: number };
export const CONTESTO_BASE: Omit<Contesto, "ora"> = { orario: ORARIO_DEFAULT, sequenze: false, ricontatti: [3, 7, 14], pausaMesi: 2, oreProposta: 24, massimoTentativi: 5 };

export type Proposta = {
  stageId: string | null; nextAction: string | null; nextActionAt: number | null;
  lostReason?: string; attemptCount?: number; sequenceStep?: number; pausedUntil?: number | null; passo?: string; noShow?: number;
};

export { AZIONE_PAUSA };

// Involucri della transizione unica (worker/processo/transizione.ts): le firme restano quelle di prima.
export function propostaEsito(esito: Esito, lead: LeadTransizione, c: Contesto, call?: { scheduledAt: number }): Proposta {
  return transizione(lead, { tipo: "esito", esito, call }, c);
}

export type Evento = Exclude<EventoTransizione, { tipo: "esito" }>;
// Gli eventi delle call e delle proposte non dipendono dai tentativi del lead.
export function propostaEvento(e: Evento, c: Contesto): Proposta {
  return transizione({ stageId: "", attemptCount: 0, primoTentativoAt: null }, e, c);
}

export function finePausa(lead: { pausedUntil: number | null }, ora: number) {
  if (lead.pausedUntil == null || lead.pausedUntil > ora) return null;
  return { nextAction: AZIONE_PAUSA, nextActionAt: ora };
}
