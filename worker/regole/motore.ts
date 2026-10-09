import { daRoma, partiRoma } from "../lib/roma";
import { ORARIO_DEFAULT, alleOre, type Orario } from "./orario";

// Le regole propongono, le persone salvano (spec 6.3). Qui solo funzioni pure.

export const ESITI = ["risposto", "non_risponde", "occupato", "richiamare", "appuntamento", "non_interessato", "fuori_target"] as const;
export type Esito = (typeof ESITI)[number];

export type Contesto = { ora: number; orario: Orario; sequenze: boolean; ricontatti: number[]; pausaMesi: number; oreProposta: number; massimoTentativi: number };
export const CONTESTO_BASE: Omit<Contesto, "ora"> = { orario: ORARIO_DEFAULT, sequenze: false, ricontatti: [3, 7, 14], pausaMesi: 2, oreProposta: 48, massimoTentativi: 5 };

export type Proposta = {
  stageId: string | null; nextAction: string | null; nextActionAt: number | null;
  lostReason?: string; attemptCount?: number; sequenceStep?: number; pausedUntil?: number | null; passo?: string;
};

const ORA_MS = 3_600_000;
const domaniAlle10 = (c: Contesto) => alleOre(c.ora, 1, 10, 0, c.orario);
// Con le sequenze spente nessuna proposta avanza un passo di sequenza.
const passoSequenza = (c: Contesto, n: number) => (c.sequenze ? { sequenceStep: n } : {});

// Passi dei tentativi: [azione, giorni dopo il primo tentativo] (null = subito).
const PASSI: [string, number | null][] = [
  ["WhatsApp: Non ti ho trovato", null],
  ["Seconda chiamata", 1],
  ["Email: Ti ho cercato", 2],
  ["Terza chiamata", 3],
];

// "Occupato" conta il tentativo ma non avanza la sequenza: si riprova tra un'ora.
function tentativo(lead: { stageId: string; attemptCount: number; primoTentativoAt: number | null }, c: Contesto, prossimaSenzaSequenza: () => number, seguiSequenza = true): Proposta {
  const fatti = lead.attemptCount + 1;
  const passo = `Tentativo ${fatti} di ${c.massimoTentativi}`;
  if (fatti >= c.massimoTentativi) return { stageId: "non-chiuso", lostReason: "non_raggiungibile", nextAction: null, nextActionAt: null, attemptCount: fatti, passo };
  const stageId = lead.stageId === "da-chiamare-prima-volta" ? "non-chiamato" : null;
  // Oltre i passi previsti (massimo tentativi alzato in Impostazioni) si richiama e basta.
  const passoPrevisto = PASSI[fatti - 1];
  if (!c.sequenze || !seguiSequenza || !passoPrevisto) return { stageId, nextAction: "Richiamare", nextActionAt: prossimaSenzaSequenza(), attemptCount: fatti, passo };
  const [azione, giorni] = passoPrevisto;
  const primo = lead.primoTentativoAt ?? c.ora;
  return { stageId, nextAction: azione, nextActionAt: giorni == null ? c.ora : alleOre(primo, giorni, 10, 0, c.orario), attemptCount: fatti, passo };
}

export function propostaEsito(esito: Esito, lead: { stageId: string; attemptCount: number; primoTentativoAt: number | null }, c: Contesto, call?: { scheduledAt: number }): Proposta {
  switch (esito) {
    case "risposto":
      return { stageId: null, nextAction: "Follow-up", nextActionAt: alleOre(c.ora, 3, 10, 0, c.orario) };
    case "non_risponde":
      return tentativo(lead, c, () => domaniAlle10(c));
    case "occupato":
      return tentativo(lead, c, () => c.ora + ORA_MS, false);
    case "richiamare":
      return { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: domaniAlle10(c) };
    case "appuntamento":
      return { stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: call?.scheduledAt ?? null };
    case "non_interessato":
      return { stageId: "non-chiuso", lostReason: "non_interessato", nextAction: null, nextActionAt: null };
    case "fuori_target":
      return { stageId: "fuori-target", lostReason: "fuori_target", nextAction: null, nextActionAt: null };
  }
}

export type Evento =
  | { tipo: "call_fissata"; kind: "conoscenza" | "presentazione"; scheduledAt: number }
  | { tipo: "call_fatta"; kind: "conoscenza"; presentazioneAt: number | null }
  | { tipo: "call_fatta"; kind: "presentazione" }
  | { tipo: "call_saltata" }
  | { tipo: "proposta_registrata"; haCallPresentazione: boolean }
  | { tipo: "ricontatto_senza_risposta"; base: number; passo: number }
  | { tipo: "proposta_senza_call"; sentAt: number };

function pausa(c: Contesto): Proposta {
  const p = partiRoma(c.ora);
  // Il 31 più un mese non deve sforare nel mese dopo: ci si ferma all'ultimo giorno.
  const ultimo = partiRoma(daRoma(p.anno, p.mese + c.pausaMesi + 1, 0, 12, 0)).giorno;
  const fine = alleOre(daRoma(p.anno, p.mese + c.pausaMesi, Math.min(p.giorno, ultimo), 10, 0), 0, 10, 0, c.orario);
  return { stageId: "probabilmente-bloccato", nextAction: "Richiamare dopo la pausa", nextActionAt: fine, pausedUntil: fine, sequenceStep: 0 };
}

export function propostaEvento(e: Evento, c: Contesto): Proposta {
  switch (e.tipo) {
    case "call_fissata":
      return e.kind === "conoscenza"
        ? { stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: e.scheduledAt }
        : { stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: e.scheduledAt };
    case "call_fatta":
      if (e.kind === "conoscenza") {
        return { stageId: e.presentazioneAt ? "presentazione-confermata" : "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: c.ora + c.oreProposta * ORA_MS };
      }
      return { stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: alleOre(c.ora, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
    case "call_saltata":
      return { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: domaniAlle10(c), attemptCount: 0, sequenceStep: 0 };
    case "proposta_registrata":
      return e.haCallPresentazione
        ? { stageId: null, nextAction: null, nextActionAt: null }
        : { stageId: null, nextAction: "Fissare la call di presentazione", nextActionAt: domaniAlle10(c) };
    case "ricontatto_senza_risposta":
      if (e.passo >= c.ricontatti.length) return pausa(c);
      return { stageId: null, nextAction: "Follow-up preventivo", nextActionAt: alleOre(e.base, c.ricontatti[e.passo], 10, 0, c.orario), ...passoSequenza(c, e.passo + 1) };
    case "proposta_senza_call":
      return { stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: alleOre(e.sentAt, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
  }
}

export function finePausa(lead: { stageId: string; pausedUntil: number | null }, ora: number) {
  if (lead.stageId !== "probabilmente-bloccato" || lead.pausedUntil == null || lead.pausedUntil > ora) return null;
  return { nextAction: "Richiamare dopo la pausa", nextActionAt: ora };
}
