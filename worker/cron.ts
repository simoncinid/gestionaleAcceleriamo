import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, type Db } from "./db/client";
import { activities, proposals } from "./db/schema";
import { generaRicorrenti } from "./lavori/service";
import { mandaInvitiInCoda } from "./calls/service";
import { ritentaConferme } from "./email/conferma";
import type { Env } from "./env";
import { giroFoglio } from "./foglio/sync";
import { leggiImpostazioni } from "./impostazioni/service";
import { segnaErrore, segnaOk } from "./integrazioni/stato";
import { partiRoma } from "./lib/roma";
import { retryPendingMetaLeads } from "./meta/ingest";

export type Lavoro = "conferme" | "foglio" | "meta" | "proposte_scadute" | "lavori";

// Quanto fa al massimo ogni lavoro in un giro. Sul piano gratuito una invocazione ha 50 query D1 (e al massimo
// 15 sottorichieste per giro, vincolo del piano). Misurato in tests/cron.test.ts: un lead nuovo dal foglio costa
// circa 17 query con la sua catena (2 lead: 40), uno da Meta circa 13 (3 lead: 41), cinque conferme ritentate 32.
// Gli inviti in coda viaggiano con le conferme: un invito costa circa 7 query e una sottorichiesta.
export const LIMITI = { conferme: 5, foglio: 2, meta: 3, inviti: 2, lavori: 12 } as const;
// Lavori: task ricorrenti del mese, 2 letture più al massimo 12 scritture (misurato in tests/cron.test.ts). Girano alle 7:00 e alle 7:30 Roma, al posto del foglio.

// Spec 16.1: un solo Cron Trigger ogni 5 minuti; lo smistatore decide sull'ora di Roma.
// Un lavoro pesante per giro, a rotazione: foglio, conferme, Meta (ognuno ogni 15 minuti), così i tetti
// di query non si sommano. Alle 6:00 le proposte scadute prendono il posto del foglio, che riprende alle 6:15.
// Si guarda il blocco di 5 minuti e non il minuto esatto: un giro partito in ritardo di qualche secondo resta il suo giro.
export function lavoriDelGiro(now: number): Lavoro[] {
  const p = partiRoma(now);
  const blocco = Math.floor(p.minuti / 5) % 3;
  if (blocco === 1) return ["conferme"];
  if (blocco === 2) return ["meta"];
  if (p.ore === 7 && (p.minuti < 5 || (p.minuti >= 30 && p.minuti < 35))) return ["lavori"];
  return p.ore === 6 && p.minuti < 5 ? ["proposte_scadute"] : ["foglio"];
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
export async function giro(env: Env, now: number): Promise<{ fatti: Lavoro[]; errori: string[] }> {
  const db = getDb(env.DB);
  const fatti = lavoriDelGiro(now);
  const esegui: Record<Lavoro, () => Promise<unknown>> = {
    conferme: async () => {
      await ritentaConferme(env, now, LIMITI.conferme);
      await mandaInvitiInCoda(env, now, LIMITI.inviti);
    },
    foglio: () => giroFoglio(env, now, LIMITI.foglio),
    meta: () => retryPendingMetaLeads(env, LIMITI.meta),
    proposte_scadute: () => scadiProposte(db, now),
    lavori: () => generaRicorrenti(db, now, LIMITI.lavori),
  };
  const errori: string[] = [];
  for (const l of fatti) {
    try {
      await esegui[l]();
    } catch (e) {
      errori.push(`${l}: ${(e as Error).message}`);
    }
  }
  if (errori.length) await segnaErrore(db, "giro", errori.join("; "), now);
  else await segnaOk(db, "giro", now);
  return { fatti, errori };
}
