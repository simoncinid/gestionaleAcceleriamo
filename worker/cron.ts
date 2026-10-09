import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
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
// (un lead, una conferma, una push) e sottorichieste per unità. I numeri vengono dalle misure di
// tests/cron.test.ts del Piano A: lead dal foglio circa 17 query, una conferma 6. Meta misurato con contaD1
// (che conta anche gli statement dentro le batch): 1 query fissa più 15 per lead, quindi 2 lead per giro.
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
const ogni10 = (p: PartiRoma) => blocco(p) % 2 === 0;
const ogni15 = (p: PartiRoma) => blocco(p) % 3 === 0;
const sempre = () => true;
const alle6 = (p: PartiRoma) => p.ore === 6 && p.minuti < 5;

// L'ordine delle chiavi è la priorità: prima ciò che tocca un lead che aspetta, poi il resto.
// Eccezione: le proposte scadute girano solo alle 6:00 e chiedono 42 query fisse, quindi passano per prime
// in quel giro (come nel Piano A, da sole): Meta e conferme saltano e riprovano ai giri dopo.
export const LAVORI: Partial<Record<Lavoro, DefLavoro>> = {
  proposte_scadute: { quando: alle6, fisse: 42, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => scadiProposte(getDb(e.DB), n) },
  foglio: { quando: (p) => ogni10(p) && !alle6(p), fisse: 6, perUnita: 17, sottoPerUnita: 2, max: 2, esegui: (e, n, l) => giroFoglio(e, n, l) },
  meta: { quando: ogni15, fisse: 2, perUnita: 15, sottoPerUnita: 1, max: 2, esegui: (e, _n, l) => retryPendingMetaLeads(e, l) },
  conferme: {
    quando: sempre, fisse: 2, perUnita: 7, sottoPerUnita: 1, max: 5,
    esegui: async (e, n, l) => {
      await ritentaConferme(e, n, l);
      await mandaInvitiInCoda(e, n, Math.min(2, l));
    },
  },
};

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
  const db = getDb(env.DB);
  if (errori.length) await segnaErrore(db, "giro", errori.join("; "), now);
  else await segnaOk(db, "giro", now);
  return { fatti, saltati, errori, query: contatore.query };
}
