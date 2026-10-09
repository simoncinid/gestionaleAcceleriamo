import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { COSTO_AVVISI, controllaAvvisi, controllaMeta48 } from "./avvisi/controlli";
import { getDb, type Db } from "./db/client";
import { activities, proposals } from "./db/schema";
import { mandaInvitiInCoda } from "./calls/service";
import { ritentaConferme } from "./email/conferma";
import type { Env } from "./env";
import { giroFoglio } from "./foglio/sync";
import { leggiImpostazioni } from "./impostazioni/service";
import { segnaErrore, segnaOk } from "./integrazioni/stato";
import { contaD1, QUERY_GIRO, SOTTORICHIESTE_GIRO } from "./lib/bilancio";
import { partiRoma, type PartiRoma } from "./lib/roma";
import { retryPendingMetaLeads } from "./meta/ingest";

export type Lavoro = "avvisi" | "consegna" | "foglio" | "meta" | "meta_48h" | "conferme" | "claude" | "telegram" | "proposte_scadute" | "lunedi";

// Ogni lavoro dichiara quanto costa: query fisse (letture di impostazioni e stato), query per unità
// (un lead, una conferma, un invito, una push) e sottorichieste per unità. Misure con contaD1, che conta anche
// gli statement dentro le batch: foglio 5 fisse più 20 per lead nuovo, Meta 1 più 16 per lead (l'avviso
// "Lead nuovo" della catena aggiunge una query a lead), avvisi 8 fisse più una per avviso,
// conferma 1 più 6, invito circa 6,5. Le sottorichieste fisse (la lettura del foglio) stanno dentro la stima
// per unità, che è larga: foglio 2 per lead (CSV più email di conferma), Meta 2 (Graph più email).
export type DefLavoro = {
  quando: (p: PartiRoma) => boolean;
  fisse: number;
  perUnita: number;
  sottoPerUnita: number;
  max: number;
  esegui: (env: Env, now: number, limite: number) => Promise<unknown>;
};

// Spec 16, frequenze. Il blocco è di 5 minuti: un giro partito in ritardo di qualche secondo resta il suo.
const blocco = (p: PartiRoma) => Math.floor(p.minuti / 5);
const ogni15 = (p: PartiRoma) => blocco(p) % 3 === 0;
const sempre = () => true;
const alle6 = (p: PartiRoma) => p.ore === 6 && p.minuti < 5;

// L'ordine delle chiavi è la priorità: prima ciò che tocca un lead che aspetta, poi il resto.
// Eccezione: le proposte scadute girano solo alle 6:00 e chiedono 42 query fisse, quindi passano per prime
// in quel giro (come nel Piano A, da sole): Meta e conferme saltano e riprovano ai giri dopo.
export const LAVORI: Partial<Record<Lavoro, DefLavoro>> = {
  proposte_scadute: { quando: alle6, fisse: 42, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => scadiProposte(getDb(e.DB), n) },
  // Criterio 1 della spec: un lead del foglio in Scaletta entro 10 minuti. Il foglio gira a ogni giro
  // (tranne alle 6:00, che è delle proposte) e prende quanti lead il budget consente, al massimo 2.
  // Con un arretrato grande (prima lettura del foglio) il foglio non deve affamare Meta e conferme: se nel
  // giro è in programma un altro lavoro prende al massimo 1 lead (25 query), da solo fino a 2 se il budget li copre.
  foglio: { quando: (p) => !alle6(p), fisse: 5, perUnita: 20, sottoPerUnita: 2, max: 2, esegui: (e, n, l) => giroFoglio(e, n, altriInProgramma("foglio", n) ? Math.min(1, l) : l) },
  meta: { quando: ogni15, fisse: 2, perUnita: 16, sottoPerUnita: 2, max: 2, esegui: (e, _n, l) => retryPendingMetaLeads(e, l) },
  // Avvisi in app (spec 8): a ogni giro, dopo l'ingresso dei lead. Un lead che non è ancora entrato non si può
  // chiamare, quindi foglio e Meta passano prima; con un arretrato nel foglio alle :15 gli avvisi aspettano
  // il giro dopo (5 minuti, dentro i 30 del preavviso). Fisse 8 (letture e chiusure), una query per unità.
  avvisi: { quando: sempre, ...COSTO_AVVISI, sottoPerUnita: 0, esegui: (e, n, l) => controllaAvvisi(e, n, l) },
  // Conferme e inviti si dividono lo stesso limite: ogni unità (una conferma o un invito) costa al massimo
  // 7 query e una sottorichiesta, così il budget conta anche gli inviti.
  conferme: {
    quando: sempre, fisse: 2, perUnita: 7, sottoPerUnita: 1, max: 7,
    esegui: async (e, n, l) => {
      // Prima gli inviti (fino a metà del limite, arrotondata in su): con un limite di 1 l'invito parte lo stesso.
      // Le conferme prendono quello che gli inviti non hanno usato.
      const fatti = await mandaInvitiInCoda(e, n, Math.min(2, Math.ceil(l / 2)));
      if (l - fatti > 0) await ritentaConferme(e, n, l - fatti);
    },
  },
  // Spec 8: Meta senza lead da 48 ore, una volta l'ora (giro delle :00). 3 query misurate.
  meta_48h: { quando: (p) => p.minuti < 5, fisse: 3, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => controllaMeta48(e, n) },
};

// Vero se nel giro di questo istante c'è in programma almeno un altro lavoro oltre a quello indicato.
function altriInProgramma(nome: Lavoro, now: number): boolean {
  const p = partiRoma(now);
  return Object.entries(LAVORI).some(([k, d]) => k !== nome && d!.quando(p));
}

export function registraLavoro(nome: Lavoro, def: DefLavoro) {
  LAVORI[nome] = def;
}

export function limiteDi(def: DefLavoro, residuoQuery: number, residuoSotto: number): number {
  if (residuoQuery < def.fisse) return 0;
  const perQuery = def.perUnita > 0 ? Math.floor((residuoQuery - def.fisse) / def.perUnita) : def.max;
  const perSotto = def.sottoPerUnita > 0 ? Math.floor(residuoSotto / def.sottoPerUnita) : def.max;
  return Math.max(0, Math.min(def.max, perQuery, perSotto));
}

// Spec 6.8: validità di 30 giorni. Senza data di validità conta l'invio più i giorni di Impostazioni.
export async function scadiProposte(db: Db, now: number): Promise<number> {
  const { validita } = await leggiImpostazioni(db);
  const limite = sql`coalesce(${proposals.validUntil}, ${proposals.sentAt} + ${validita.giorni * 86_400_000})`;
  const scadute = await db.select({ id: proposals.id, number: proposals.number, leadId: proposals.leadId }).from(proposals)
    .where(and(inArray(proposals.status, ["registrata", "presentata"]), isNull(proposals.deletedAt), lt(limite, now)))
    .limit(20); // due scritture per proposta: 20 stanno sotto le 50 query; le altre il giorno dopo
  if (!scadute.length) return 0;
  const passi = scadute.flatMap((p) => [
    db.update(proposals).set({ status: "scaduta", decidedAt: now, updatedAt: now }).where(eq(proposals.id, p.id)),
    ...(p.leadId ? [db.insert(activities).values({ id: crypto.randomUUID(), leadId: p.leadId, type: "proposta" as const, body: `Preventivo ${p.number} scaduto`, authorId: null, createdAt: now })] : []),
  ]);
  await db.batch(passi as [(typeof passi)[number], ...(typeof passi)[number][]]);
  return scadute.length;
}

// Un lavoro che fallisce non ferma gli altri; il giro diventa rosso con l'elenco degli errori.
// Le query si contano davvero (contaD1); le sottorichieste si prenotano dalla stima del lavoro.
export async function giro(env: Env, now: number): Promise<{ fatti: Lavoro[]; saltati: Lavoro[]; errori: string[]; query: number }> {
  if (env.SPAZIO === "demo") return { fatti: [], saltati: [], errori: [], query: 0 };
  const contatore = { query: 0 };
  const envContato: Env = { ...env, DB: contaD1(env.DB, contatore) };
  const p = partiRoma(now);
  const fatti: Lavoro[] = [];
  const saltati: Lavoro[] = [];
  const errori: string[] = [];
  let sotto = SOTTORICHIESTE_GIRO;
  const RISERVA_FINALE = 1; // la riga "giro" in integration_status
  for (const [nome, def] of Object.entries(LAVORI) as [Lavoro, DefLavoro][]) {
    if (!def.quando(p)) continue;
    const limite = limiteDi(def, QUERY_GIRO - RISERVA_FINALE - contatore.query, sotto);
    if (limite < 1) {
      saltati.push(nome);
      continue;
    }
    sotto -= limite * def.sottoPerUnita;
    try {
      await def.esegui(envContato, now, limite);
      fatti.push(nome);
    } catch (e) {
      errori.push(`${nome}: ${(e as Error).message}`);
    }
  }
  // Anche la riga "giro" passa dal contatore: query restituito è il totale vero dell'invocazione.
  const db = getDb(envContato.DB);
  if (errori.length) await segnaErrore(db, "giro", errori.join("; "), now);
  else await segnaOk(db, "giro", now);
  return { fatti, saltati, errori, query: contatore.query };
}
