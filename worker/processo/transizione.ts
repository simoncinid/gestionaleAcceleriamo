import { daRoma, partiRoma } from "../lib/roma";
import { alleOre, scadenzaLavorativa } from "../regole/orario";
import { AZIONE_RIFISSARE, AZIONE_RIPROVARE, giorniLavorativiDopo } from "./processo";
import type { Contesto, Esito, Proposta } from "../regole/motore";

// Unico punto dei cambi di fase (contratto blocco 1, sezione 2, colonna "Cosa succede dopo"): riceve il lead e
// l'evento e restituisce la proposta da salvare. Le regole propongono, le persone salvano (spec 6.3). Funzione pura.
// motore.ts e i servizi la chiamano soltanto.

// Azione della fine pausa: la usano il motore, il giro degli avvisi e il gruppo "Fine pausa" di Oggi.
export const AZIONE_PAUSA = "Richiamare dopo la pausa";

// noShow e pausedUntil servono solo alla regola del no-show (fasi 30 e 50).
export type LeadTransizione = { stageId: string; attemptCount: number; primoTentativoAt: number | null; noShow?: number | null; pausedUntil?: number | null };

const FASI_CALL = ["appuntamento-confermato", "presentazione-confermata"];

export type Evento =
  | { tipo: "esito"; esito: Esito; call?: { scheduledAt: number } }
  | { tipo: "call_fissata"; kind: "conoscenza" | "presentazione"; scheduledAt: number }
  | { tipo: "call_fatta"; kind: "conoscenza"; presentazioneAt: number | null }
  | { tipo: "call_fatta"; kind: "presentazione" }
  // "Non si è presentato" (fasi 30 e 50): la fase resta, si rifissa; alla seconda assenza pausa di 2 mesi.
  | { tipo: "no_show" }
  | { tipo: "proposta_registrata"; haCallPresentazione: boolean }
  | { tipo: "ricontatto_senza_risposta"; base: number; passo: number }
  | { tipo: "proposta_senza_call"; sentAt: number }
  // Fase scelta a mano (selettore o foglio): azione e scadenza di base della fase nuova.
  | { tipo: "cambio_fase"; stageId: string };

const ORA_MS = 3_600_000;
const domaniAlle10 = (c: Contesto) => alleOre(c.ora, 1, 10, 0, c.orario);
// Dopo la consulenza il preventivo è pronto entro 2 giorni lavorativi (contratto blocco 1, ipotesi 9).
const quandoPreventivo = (c: Contesto) => giorniLavorativiDopo(c.ora, 2, c.orario);
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
    case "appuntamento":
      return { stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: call?.scheduledAt ?? null };
    case "non_interessato":
      // Il motivo lo sceglie la persona dalla lista fissa (contratto blocco 1, sezione 7).
      return { stageId: "non-chiuso", nextAction: null, nextActionAt: null };
    case "fuori_target":
      return { stageId: "fake", lostReason: "fuori_target", nextAction: null, nextActionAt: null };
    case "consulenza_fatta":
      return { stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: quandoPreventivo(c) };
    case "presentazione_fissata":
      return { stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: call?.scheduledAt ?? null };
    case "presentazione_fatta":
      return { stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: alleOre(c.ora, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
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
      return e.kind === "conoscenza"
        ? { stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: e.scheduledAt }
        : { stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: e.scheduledAt };
    case "call_fatta":
      if (e.kind === "conoscenza") {
        return { stageId: e.presentazioneAt ? "presentazione-confermata" : "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: quandoPreventivo(c) };
      }
      return { stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: alleOre(c.ora, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
    case "no_show": {
      const noShow = (lead.noShow ?? 0) + 1;
      // Prima assenza: fase e tentativi restano, si rifissa entro 2 ore lavorative.
      if (noShow < 2) return { stageId: null, nextAction: AZIONE_RIFISSARE, nextActionAt: scadenzaLavorativa(c.ora, 120, c.orario), noShow };
      return { ...pausa(c, null), nextAction: AZIONE_RIPROVARE, noShow };
    }
    case "proposta_registrata":
      return e.haCallPresentazione
        ? { stageId: null, nextAction: null, nextActionAt: null }
        : { stageId: null, nextAction: "Fissare la call di presentazione", nextActionAt: domaniAlle10(c) };
    case "ricontatto_senza_risposta":
      if (e.passo >= c.ricontatti.length) return pausa(c);
      return { stageId: null, nextAction: "Follow-up preventivo", nextActionAt: alleOre(e.base, c.ricontatti[e.passo], 10, 0, c.orario), ...passoSequenza(c, e.passo + 1) };
    case "cambio_fase":
      return perFase(e.stageId, c);
    case "proposta_senza_call":
      return { stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: alleOre(e.sentAt, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
  }
}


// Azione e scadenza di base quando la fase si sceglie a mano. Le fasi con la call (30, 50) le fissa la call.
function perFase(stageId: string, c: Contesto): Proposta {
  switch (stageId) {
    case "da-chiamare-prima-volta": return { stageId, nextAction: "Prima chiamata", nextActionAt: c.ora };
    case "da-richiamare": return { stageId, nextAction: "Richiamare", nextActionAt: domaniAlle10(c) };
    case "in-attesa-preventivo": return { stageId, nextAction: "Preparare il preventivo", nextActionAt: quandoPreventivo(c) };
    case "in-attesa-decisione": return { stageId, nextAction: "Follow-up preventivo", nextActionAt: alleOre(c.ora, c.ricontatti[0], 10, 0, c.orario), ...passoSequenza(c, 1) };
    case "appuntamento-confermato": return { stageId, nextAction: "Call di conoscenza", nextActionAt: null };
    case "presentazione-confermata": return { stageId, nextAction: "Call di presentazione", nextActionAt: null };
    default: return { stageId, nextAction: null, nextActionAt: null };
  }
}
