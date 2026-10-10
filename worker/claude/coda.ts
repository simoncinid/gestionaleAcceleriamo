import { getDb } from "../db/client";
import type { AiTipo, aiJobs } from "../db/schema";
import type { Env } from "../env";
import { avvisa } from "../avvisi/service";
import { leggiImpostazioni } from "../impostazioni/service";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { meseRoma } from "../lib/roma";
import { ErroreClaude } from "./client";
import { costoMassimoMicros, costoMicros, microsDaCents, usoVuoto, type ImpClaude, type Stima, type Uso } from "./costo";

export type LavoroAi = typeof aiJobs.$inferSelect;
export type DefTipo = {
  stima: (imp: ImpClaude) => Stima;
  esegui: (env: Env, job: LavoroAi, imp: ImpClaude, now: number) => Promise<{ uso: Uso; modello: string }>;
  alErrore: (db: D1Database, job: LavoroAi, messaggio: string, now: number) => Promise<void>;
};

// I gestori dei tipi (classificazione, scheda, coach, commento) si registrano dai loro moduli.
export const TIPI: Partial<Record<AiTipo, DefTipo>> = {};
export function registraTipo(t: AiTipo, d: DefTipo) {
  TIPI[t] = d;
}

const BLOCCATO_DOPO = 20 * 60_000; // un lavoro "in corso" da 20 minuti è morto con l'invocazione (un cron dura al massimo 15)
const MAX_TENTATIVI = 2;

const euroTondi = (cents: number) => `€ ${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

// Un lavoro per oggetto: se ce n'è già uno in coda, in corso o fermo per il tetto, si riusa quello.
export async function accoda(db: D1Database, j: { tipo: AiTipo; entityId: string; leadId?: string | null; chi?: string | null; forzato?: boolean }, now: number): Promise<{ id: string; nuovo: boolean }> {
  const gia = await db.prepare("SELECT id FROM ai_jobs WHERE tipo = ?1 AND entity_id = ?2 AND stato IN ('in_coda','in_corso','fermo_tetto') LIMIT 1").bind(j.tipo, j.entityId).first<{ id: string }>();
  if (gia) return { id: gia.id, nuovo: false };
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO ai_jobs (id, tipo, entity_id, lead_id, stato, forzato, richiesto_da, created_at) VALUES (?1, ?2, ?3, ?4, 'in_coda', ?5, ?6, ?7)")
    .bind(id, j.tipo, j.entityId, j.leadId ?? null, j.forzato ? 1 : 0, j.chi ?? null, now).run();
  return { id, nuovo: true };
}

const SPESO = "SELECT coalesce(sum(costo_micros), 0) FROM claude_usage WHERE mese = ?1";

// Micro-dollari spesi nel mese (AAAA-MM, mese di Roma).
export async function spesoDelMese(db: D1Database, mese: string): Promise<number> {
  return (await db.prepare(`SELECT (${SPESO}) AS s`).bind(mese).first<{ s: number }>())?.s ?? 0;
}

const registraUso = (db: D1Database, job: LavoroAi, uso: Uso, modello: string, costo: number, stimato: boolean, mese: string, now: number) =>
  db.prepare(`INSERT INTO claude_usage (id, job_id, tipo, modello, mese, ingresso, uscita, cache_lettura, cache_scrittura, ricerche, costo_micros, stimato, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(crypto.randomUUID(), job.id, job.tipo, modello, mese, uso.ingresso, uso.uscita, uso.cacheLettura, uso.cacheScrittura, uso.ricerche, costo, stimato ? 1 : 0, now);

// Spec 7.5: prima di ogni lavoro, speso del mese + costo massimo sotto il tetto. Al primo fermo del mese,
// avviso a tutti e due (in app, push, Telegram): la chiave dell'avviso è il mese, quindi nasce una volta sola.
// Query, misurate con contaD1 nel test del giro: fisse al massimo 7 (riapertura dei fermi e dei bloccati in una
// batch da 2, coda con lo speso del mese, impostazioni, fermi, avviso, stato), per lavoro 3 più quelle del gestore.
// Senza chiave o senza tipi registrati non tocca D1.
export async function lavoraCoda(env: Env, now: number, limite: number): Promise<{ fatti: number; fermi: number; errori: number }> {
  const esito = { fatti: 0, fermi: 0, errori: 0 };
  if (!env.ANTHROPIC_API_KEY) return esito; // "Non collegato": i lavori aspettano in coda
  const tipi = Object.keys(TIPI) as AiTipo[];
  if (!tipi.length || limite < 1) return esito;
  const db = env.DB;
  const mese = meseRoma(now);
  await db.batch([
    // Il primo del mese (a Roma) i fermi del mese prima tornano in coda.
    db.prepare("UPDATE ai_jobs SET stato = 'in_coda', fermo_mese = NULL WHERE stato = 'fermo_tetto' AND fermo_mese < ?1").bind(mese),
    db.prepare(`UPDATE ai_jobs SET tentativi = tentativi + 1,
        stato = CASE WHEN tentativi + 1 >= ?2 THEN 'errore' ELSE 'in_coda' END,
        errore = CASE WHEN tentativi + 1 >= ?2 THEN 'Lavoro interrotto' ELSE errore END
      WHERE stato = 'in_corso' AND started_at < ?1`).bind(now - BLOCCATO_DOPO, MAX_TENTATIVI),
  ]);
  const segnaposti = tipi.map((_, i) => `?${i + 3}`).join(",");
  const righe = (await db.prepare(`SELECT j.*, (${SPESO}) AS speso_mese FROM ai_jobs j
      WHERE j.stato = 'in_coda' AND j.tipo IN (${segnaposti}) ORDER BY j.created_at LIMIT ?2`)
    .bind(mese, limite * 3, ...tipi).all<Record<string, unknown>>()).results;
  if (!righe.length) return esito;
  let speso = Number(righe[0].speso_mese ?? 0);
  const imp = (await leggiImpostazioni(getDb(db))).claude;
  const tetto = microsDaCents(imp.tettoCents);
  const quanti = Math.min(limite, imp.lavoriPerGiro);
  const fermi: string[] = [];
  for (const job of righe.map(daRiga)) {
    if (esito.fatti + esito.errori >= quanti) break;
    const def = TIPI[job.tipo]!;
    const stima = def.stima(imp);
    const massimo = costoMassimoMicros(stima, imp);
    if (speso + massimo > tetto) {
      fermi.push(job.id);
      continue;
    }
    await db.prepare("UPDATE ai_jobs SET stato = 'in_corso', started_at = ?1 WHERE id = ?2").bind(now, job.id).run();
    try {
      const r = await def.esegui(env, job, imp, now);
      const costo = costoMicros(r.uso, r.modello, imp);
      speso += costo;
      await db.batch([
        registraUso(db, job, r.uso, r.modello, costo, false, mese, now),
        db.prepare("UPDATE ai_jobs SET stato = 'pronto', errore = NULL, finished_at = ?1 WHERE id = ?2").bind(now, job.id),
      ]);
      esito.fatti++;
    } catch (e) {
      const err = e instanceof ErroreClaude ? e : new ErroreClaude((e as Error).message, usoVuoto(), stima.modello, false);
      // Una chiamata interrotta non dice quanto è costata: si conta il costo massimo, mai zero.
      const costo = err.interrotta ? massimo : costoMicros(err.uso, err.modello, imp);
      const ancora = err.ritentabile && job.tentativi + 1 < MAX_TENTATIVI;
      speso += costo;
      await db.batch([
        ...(costo > 0 ? [registraUso(db, job, err.uso, err.interrotta ? stima.modello : err.modello, costo, err.interrotta, mese, now)] : []),
        db.prepare("UPDATE ai_jobs SET stato = ?1, tentativi = tentativi + 1, errore = ?2, finished_at = ?3 WHERE id = ?4")
          .bind(ancora ? "in_coda" : "errore", err.message.slice(0, 500), now, job.id),
      ]);
      if (!ancora) await def.alErrore(db, job, err.message, now);
      esito.errori++;
    }
  }
  if (fermi.length) {
    await db.prepare(`UPDATE ai_jobs SET stato = 'fermo_tetto', fermo_mese = ?1 WHERE id IN (${fermi.map((_, i) => `?${i + 2}`).join(",")})`).bind(mese, ...fermi).run();
    await avvisa(getDb(db), {
      evento: "claude_tetto",
      entityId: mese,
      titolo: `Claude si è fermato: tetto di ${euroTondi(imp.tettoCents)} raggiunto`,
      testo: "I lavori ripartono il primo del mese, oppure alzando il tetto in Impostazioni.",
      href: "/impostazioni/integrazioni/claude",
    }, now);
    esito.fermi = fermi.length;
  }
  if (esito.errori && !esito.fatti) await segnaErrore(getDb(db), "claude", "Lavori di Claude non riusciti", now);
  else if (esito.fatti) await segnaOk(getDb(db), "claude", now);
  return esito;
}

function daRiga(r: Record<string, unknown>): LavoroAi {
  return {
    id: r.id as string, tipo: r.tipo as AiTipo, entityId: r.entity_id as string, leadId: (r.lead_id as string) ?? null,
    stato: r.stato as LavoroAi["stato"], tentativi: r.tentativi as number, errore: (r.errore as string) ?? null, erroreId: (r.errore_id as string) ?? null,
    fermoMese: (r.fermo_mese as string) ?? null, forzato: r.forzato === 1, richiestoDa: (r.richiesto_da as string) ?? null,
    createdAt: r.created_at as number, startedAt: (r.started_at as number) ?? null, finishedAt: (r.finished_at as number) ?? null,
  };
}
