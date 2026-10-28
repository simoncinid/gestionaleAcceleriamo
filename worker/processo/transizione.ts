import { daRoma, partiRoma } from "../lib/roma";
import { alleOre, scadenzaLavorativa } from "../regole/orario";
import { AZIONE_FISSA_ANALISI, AZIONE_FISSA_OFFERTA, AZIONE_FISSA_PROGETTO, AZIONE_RIFISSARE, AZIONE_RIPROVARE, FASE, giorniLavorativiDopo } from "./processo";
import type { Contesto, Esito, Proposta } from "../regole/motore";
import type { CallKind } from "../db/schema";
import { AZIONE_CALL, CALL_DELL_FASE, FASI_CON_CALL } from "../regole/fasi-call";

// Unico punto dei cambi di fase (contratto blocco 1, sezione 2, colonna "Cosa succede dopo"): riceve il lead e
// l'evento e restituisce la proposta da salvare. Le regole propongono, le persone salvano (spec 6.3). Funzione pura.
// motore.ts e i servizi la chiamano soltanto.

// Azione della fine pausa: la usano il motore, il giro degli avvisi e il gruppo "Fine pausa" di Oggi.
export const AZIONE_PAUSA = "Richiamare dopo la pausa";

// noShow e pausedUntil servono solo alla regola del no-show (fasi con call); stageChangedAt alle scadenze
// "entro 4 giorni lavorativi dall'ingresso in fase" di offerta pronta e progetto pronto.
export type LeadTransizione = { stageId: string; attemptCount: number; primoTentativoAt: number | null; noShow?: number | null; pausedUntil?: number | null; stageChangedAt?: number };

const FASI_CALL = Object.keys(FASI_CON_CALL);

export type Evento =
  | { tipo: "esito"; esito: Esito; call?: { scheduledAt: number } }
  | { tipo: "call_fissata"; kind: CallKind; scheduledAt: number }
  // prossimaAt: la call successiva fissata nello stesso foglio (offerta dopo la conoscenza, analisi dopo l'offerta).
  | { tipo: "call_fatta"; kind: CallKind; prossimaAt?: number | null }
  // "Non si è presentato" (fasi con call): la fase resta, si rifissa; alla seconda assenza pausa di 2 mesi.
  | { tipo: "no_show" }
  | { tipo: "proposta_registrata"; haCallOfferta: boolean }
  | { tipo: "ricontatto_senza_risposta"; base: number; passo: number }
  | { tipo: "proposta_senza_call"; sentAt: number }
  // Fase scelta a mano (selettore o foglio): azione e scadenza di base della fase nuova.
  | { tipo: "cambio_fase"; stageId: string };

const ORA_MS = 3_600_000;
const domaniAlle10 = (c: Contesto) => alleOre(c.ora, 1, 10, 0, c.orario);
// Offerta e progetto si preparano entro 3 giorni lavorativi; la call si fissa entro 4 dall'ingresso in fase (modifica 25).
const entro3 = (c: Contesto) => giorniLavorativiDopo(c.ora, 3, c.orario);
const entro4 = (lead: LeadTransizione, c: Contesto) => giorniLavorativiDopo(lead.stageChangedAt ?? c.ora, 4, c.orario);
const callFissata = (kind: CallKind, scheduledAt: number | null): Proposta => ({ stageId: CALL_DELL_FASE[kind], nextAction: AZIONE_CALL[kind], nextActionAt: scheduledAt });
// Dopo la call dell'offerta: con la call di analisi si va in 45, senza si resta in 40 e la si fissa entro 2 giorni lavorativi.
const dopoOfferta = (c: Contesto, analisiAt: number | null | undefined): Proposta =>
  analisiAt != null ? callFissata("analisi", analisiAt) : { stageId: FASE.offerta, nextAction: AZIONE_FISSA_ANALISI, nextActionAt: giorniLavorativiDopo(c.ora, 2, c.orario) };
const followUp = (c: Contesto): Proposta =>
  ({ stageId: FASE.decisione, nextAction: "Follow-up preventivo", nextActionAt: alleOre(c.ora, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) });
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
  const passo = `Tentativo ${Math.min(fatti, c.massimoTentativi)} di ${c.massimoTentativi}`;
  // Oltre il quinto: era l'ultima chiamata dopo la pausa, il lead si chiude.
  if (fatti > c.massimoTentativi) return { stageId: "non-chiuso", lostReason: "mai_risposto", nextAction: null, nextActionAt: null, attemptCount: fatti, passo };
  // Quinto tentativo a vuoto: pausa di due mesi, poi un'ultima chiamata.
  if (fatti === c.massimoTentativi) return { ...pausa(c, "da-richiamare"), attemptCount: fatti, passo };
  const stageId = lead.stageId === "da-chiamare-prima-volta" ? "da-richiamare" : null;
  // Oltre i passi previsti (massimo tentativi alzato in Impostazioni) si richiama e basta.
  const passoPrevisto = PASSI[fatti - 1];
  if (!c.sequenze || !seguiSequenza || !passoPrevisto) return { stageId, nextAction: "Richiamare", nextActionAt: prossimaSenzaSequenza(), attemptCount: fatti, passo };
  const [azione, giorni] = passoPrevisto;
  const primo = lead.primoTentativoAt ?? c.ora;
  return { stageId, nextAction: azione, nextActionAt: giorni == null ? c.ora : alleOre(primo, giorni, 10, 0, c.orario), attemptCount: fatti, passo };
}

function daEsito(esito: Esito, lead: LeadTransizione, c: Contesto, call?: { scheduledAt: number }): Proposta {
  switch (esito) {
    case "risposto":
      return { stageId: null, nextAction: "Follow-up", nextActionAt: alleOre(c.ora, 3, 10, 0, c.orario) };
    case "non_risponde":
    case "occupato":
      // Dopo la pausa della seconda assenza: una chiamata a vuoto chiude il lead.
      if (FASI_CALL.includes(lead.stageId) && (lead.noShow ?? 0) >= 2 && (lead.pausedUntil == null || lead.pausedUntil <= c.ora)) {
        return { stageId: "non-chiuso", lostReason: "no_show", nextAction: null, nextActionAt: null };
      }
      return esito === "non_risponde" ? tentativo(lead, c, () => domaniAlle10(c)) : tentativo(lead, c, () => c.ora + ORA_MS, false);
    case "richiamare":
      return { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: domaniAlle10(c) };
    case "non_interessato":
      // Il motivo lo sceglie la persona dalla lista fissa (contratto blocco 1, sezione 7).
      return { stageId: "non-chiuso", nextAction: null, nextActionAt: null };
    case "fuori_target":
      return { stageId: "fake", lostReason: "fuori_target", nextAction: null, nextActionAt: null };
    case "conoscenza_fissata":
      return callFissata("conoscenza", call?.scheduledAt ?? null);
    case "conoscenza_fatta":
      return { stageId: FASE.attesaOfferta, nextAction: "Preparare l'offerta", nextActionAt: entro3(c) };
    case "offerta_pronta":
      return { stageId: null, nextAction: AZIONE_FISSA_OFFERTA, nextActionAt: entro4(lead, c) };
    case "offerta_fissata":
      return callFissata("offerta", call?.scheduledAt ?? null);
    case "offerta_presentata": {
      // Senza call di analisi la fase resta (40): stageId null non la tocca.
      const p = dopoOfferta(c, call?.scheduledAt);
      return p.stageId === FASE.offerta ? { ...p, stageId: null } : p;
    }
    case "analisi_fissata":
      return callFissata("analisi", call?.scheduledAt ?? null);
    case "analisi_fatta":
      return { stageId: FASE.attesaProgetto, nextAction: "Preparare il progetto", nextActionAt: entro3(c) };
    case "progetto_pronto":
      return { stageId: null, nextAction: AZIONE_FISSA_PROGETTO, nextActionAt: entro4(lead, c) };
    case "progetto_fissato":
      return callFissata("progetto", call?.scheduledAt ?? null);
    case "progetto_presentato":
      return followUp(c);
  }
}

// Call segnata fatta: conoscenza 35 (o 40 con l'offerta già fissata), offerta 40 o 45, analisi 50, progetto 60.
function callFatta(kind: CallKind, prossimaAt: number | null | undefined, c: Contesto): Proposta {
  switch (kind) {
    case "conoscenza":
      return prossimaAt != null ? callFissata("offerta", prossimaAt) : { stageId: FASE.attesaOfferta, nextAction: "Preparare l'offerta", nextActionAt: entro3(c) };
    case "offerta": return dopoOfferta(c, prossimaAt);
    case "analisi": return { stageId: FASE.attesaProgetto, nextAction: "Preparare il progetto", nextActionAt: entro3(c) };
    case "progetto": return followUp(c);
  }
}

function pausa(c: Contesto, stageId: string | null = "in-attesa-decisione"): Proposta {
  const p = partiRoma(c.ora);
  // Il 31 più un mese non deve sforare nel mese dopo: ci si ferma all'ultimo giorno.
  const ultimo = partiRoma(daRoma(p.anno, p.mese + c.pausaMesi + 1, 0, 12, 0)).giorno;
  const fine = alleOre(daRoma(p.anno, p.mese + c.pausaMesi, Math.min(p.giorno, ultimo), 10, 0), 0, 10, 0, c.orario);
  return { stageId, nextAction: AZIONE_PAUSA, nextActionAt: fine, pausedUntil: fine, sequenceStep: 0 };
}

export function transizione(lead: LeadTransizione, e: Evento, c: Contesto): Proposta {
  switch (e.tipo) {
    case "esito":
      return daEsito(e.esito, lead, c, e.call);
    case "call_fissata":
      return callFissata(e.kind, e.scheduledAt);
    case "call_fatta":
      return callFatta(e.kind, e.prossimaAt, c);
    case "no_show": {
      const noShow = (lead.noShow ?? 0) + 1;
      // Prima assenza: fase e tentativi restano, si rifissa entro 2 ore lavorative.
      if (noShow < 2) return { stageId: null, nextAction: AZIONE_RIFISSARE, nextActionAt: scadenzaLavorativa(c.ora, 120, c.orario), noShow };
      return { ...pausa(c, null), nextAction: AZIONE_RIPROVARE, noShow };
    }
    case "proposta_registrata":
      return e.haCallOfferta
        ? { stageId: null, nextAction: null, nextActionAt: null }
        : { stageId: null, nextAction: AZIONE_FISSA_OFFERTA, nextActionAt: domaniAlle10(c) };
    case "ricontatto_senza_risposta":
      if (e.passo >= c.ricontatti.length) return pausa(c);
      return { stageId: null, nextAction: "Follow-up preventivo", nextActionAt: alleOre(e.base, c.ricontatti[e.passo], 10, 0, c.orario), ...passoSequenza(c, e.passo + 1) };
    case "cambio_fase":
      return perFase(e.stageId, c);
    case "proposta_senza_call":
      return followUp({ ...c, ora: e.sentAt });
  }
}


// Azione e scadenza di base quando la fase si sceglie a mano. Le fasi con la call (30, 40, 45, 55) le fissa la call.
function perFase(stageId: string, c: Contesto): Proposta {
  const kind = (FASI_CON_CALL as Record<string, CallKind>)[stageId];
  if (kind) return callFissata(kind, null);
  switch (stageId) {
    case FASE.nuovo: return { stageId, nextAction: "Prima chiamata", nextActionAt: c.ora };
    case FASE.richiamare: return { stageId, nextAction: "Richiamare", nextActionAt: domaniAlle10(c) };
    case FASE.attesaOfferta: return { stageId, nextAction: "Preparare l'offerta", nextActionAt: entro3(c) };
    case FASE.attesaProgetto: return { stageId, nextAction: "Preparare il progetto", nextActionAt: entro3(c) };
    case FASE.decisione: return followUp(c);
    default: return { stageId, nextAction: null, nextActionAt: null };
  }
}
