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
  // Facoltativo: uno statement che mette in coda da solo i lavori di questo tipo (per esempio la classificazione
  // dei lead nuovi). Gira nella prima batch della coda: una query fissa in più per tipo che lo usa.
  accodaDaSolo?: (db: D1Database, now: number) => D1PreparedStatement;
};

// I gestori dei tipi (classificazione, scheda, coach, commento) si registrano dai loro moduli.
export const TIPI: Partial<Record<AiTipo, DefTipo>> = {};
export function registraTipo(t: AiTipo, d: DefTipo) {
  TIPI[t] = d;
}

const BLOCCATO_DOPO = 20 * 60_000; // un lavoro "in corso" da 20 minuti è morto con l'invocazione (un cron dura al massimo 15)
const MAX_TENTATIVI = 2;
// Nessun lavoro nuovo dopo 9 minuti dall'inizio del giro (il giro passa la sua ora di partenza; chiamata da sola,
// l'ingresso nella coda): con al massimo 4 minuti di chiamata (DURATA_MAX_MS) l'ultimo finisce entro 13, sotto i
// 15 minuti del Cron Trigger. Il resto aspetta il giro dopo.
export const AVVIO_MAX_MS = 9 * 60_000;
// Il tempo trascorso si misura con l'orologio vero (non con "now" del cron); nei test si sostituisce.
let orologio: () => number = () => Date.now();
export function setOrologioCoda(f: (() => number) | null) {
  orologio = f ?? (() => Date.now());
}
// L'ora vera di adesso, sullo stesso orologio della coda: il giro la legge alla partenza.
export const orologioCoda = () => orologio();

const euroTondi = (cents: number) => `€ ${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

// Un lavoro per oggetto: se ce n'è già uno in coda, in corso o fermo per il tetto, si riusa quello.
// Una query sola nel caso comune (INSERT ... WHERE NOT EXISTS): la catena del lead nuovo accoda dentro il giro.
type NuovoLavoro = { tipo: AiTipo; entityId: string; leadId?: string | null; chi?: string | null; forzato?: boolean };

// La sola istruzione di accodamento, da mettere in una batch insieme alla riga che il lavoro elabora
// (profilo della scheda e lavoro nascono insieme o per niente).
export const istruzioneAccoda = (db: D1Database, id: string, j: NuovoLavoro, now: number) =>
  db.prepare(`INSERT INTO ai_jobs (id, tipo, entity_id, lead_id, stato, forzato, richiesto_da, created_at)
      SELECT ?1, ?2, ?3, ?4, 'in_coda', ?5, ?6, ?7
      WHERE NOT EXISTS (SELECT 1 FROM ai_jobs WHERE tipo = ?2 AND entity_id = ?3 AND stato IN ('in_coda','in_corso','fermo_tetto'))`)
    .bind(id, j.tipo, j.entityId, j.leadId ?? null, j.forzato ? 1 : 0, j.chi ?? null, now);

export async function accoda(db: D1Database, j: NuovoLavoro, now: number): Promise<{ id: string; nuovo: boolean }> {
  const id = crypto.randomUUID();
  const r = await istruzioneAccoda(db, id, j, now).run();
  if (r.meta.changes) return { id, nuovo: true };
  const gia = await db.prepare("SELECT id FROM ai_jobs WHERE tipo = ?1 AND entity_id = ?2 AND stato IN ('in_coda','in_corso','fermo_tetto') LIMIT 1").bind(j.tipo, j.entityId).first<{ id: string }>();
  return { id: gia?.id ?? id, nuovo: false };
}

const SPESO = "SELECT coalesce(sum(costo_micros), 0) FROM claude_usage WHERE mese = ?1";

// Micro-dollari spesi nel mese (AAAA-MM, mese di Roma).
export async function spesoDelMese(db: D1Database, mese: string): Promise<number> {
  return (await db.prepare(`SELECT (${SPESO}) AS s`).bind(mese).first<{ s: number }>())?.s ?? 0;
}

// Prenotazione: all'avvio il lavoro conta già il costo massimo (stimato = 1). Se l'invocazione muore a metà
// la riga resta così, e il mese non sottostima mai. A fine lavoro diventa il costo vero.
// "changes() = 1" lega l'inserimento all'aggiornamento appena fatto nella stessa batch: se un altro giro ha già
// preso il lavoro, non si prenota niente. Il tetto si ricontrolla qui, sullo speso scritto in D1 in questo istante:
// due giri sovrapposti hanno letto lo speso all'inizio, ma solo il primo che prenota passa (la batch è atomica).
const prenota = (db: D1Database, idUso: string, job: LavoroAi, modello: string, massimo: number, mese: string, now: number, tetto: number) =>
  db.prepare(`INSERT INTO claude_usage (id, job_id, tipo, modello, mese, ingresso, uscita, cache_lettura, cache_scrittura, ricerche, costo_micros, stimato, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, 0, ?6, 1, ?7 WHERE changes() = 1 AND (SELECT coalesce(sum(costo_micros), 0) FROM claude_usage WHERE mese = ?5) + ?6 <= ?8`)
    .bind(idUso, job.id, job.tipo, modello, mese, massimo, now, tetto);

const chiudiUso = (db: D1Database, idUso: string, uso: Uso, modello: string, costo: number, stimato: boolean) =>
  db.prepare(`UPDATE claude_usage SET modello = ?2, ingresso = ?3, uscita = ?4, cache_lettura = ?5, cache_scrittura = ?6, ricerche = ?7,
      costo_micros = ?8, stimato = ?9 WHERE id = ?1`)
    .bind(idUso, modello, uso.ingresso, uso.uscita, uso.cacheLettura, uso.cacheScrittura, uso.ricerche, costo, stimato ? 1 : 0);

// Spec 7.5: prima di ogni lavoro, speso del mese + costo massimo sotto il tetto. Al primo fermo del mese,
// avviso a tutti e due (in app, push, Telegram): la chiave dell'avviso è il mese, quindi nasce una volta sola.
// Query, misurate con contaD1 nel test del giro: fisse al massimo 8 (in una batch da 3 i lavori che si accodano
// da soli, oggi solo la classificazione, e la riapertura dei fermi e dei bloccati; poi coda con lo speso del mese,
// impostazioni, fermi, avviso, stato), per lavoro 4 (presa con prenotazione e chiusura, due batch da 2) più quelle
// del gestore (al massimo 7, vedi tipi.ts). Un lavoro preso da un altro giro costa 2 query e conta lo stesso come
// unità del giro.
// Senza chiave o senza tipi registrati non tocca D1.
export async function lavoraCoda(env: Env, now: number, limite: number, inizio = orologio()): Promise<{ fatti: number; fermi: number; errori: number }> {
  const esito = { fatti: 0, fermi: 0, errori: 0 };
  if (!env.ANTHROPIC_API_KEY) return esito; // "Non collegato": i lavori aspettano in coda
  const tipi = Object.keys(TIPI) as AiTipo[];
  if (!tipi.length || limite < 1) return esito;
  const db = env.DB;
  const mese = meseRoma(now);
  const automatici = tipi.flatMap((t) => (TIPI[t]!.accodaDaSolo ? [TIPI[t]!.accodaDaSolo!(db, now)] : []));
  await db.batch([
    ...automatici,
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
  let presi = 0;
  for (const job of righe.map(daRiga)) {
    if (presi >= quanti) break;
    if (orologio() - inizio > AVVIO_MAX_MS) break;
    const def = TIPI[job.tipo]!;
    const stima = def.stima(imp);
    const massimo = costoMassimoMicros(stima, imp);
    if (speso + massimo > tetto) {
      fermi.push(job.id);
      continue;
    }
    presi++;
    const idUso = crypto.randomUUID();
    const presa = await db.batch([
      db.prepare("UPDATE ai_jobs SET stato = 'in_corso', started_at = ?1 WHERE id = ?2 AND stato = 'in_coda'").bind(now, job.id),
      prenota(db, idUso, job, stima.modello, massimo, mese, now, tetto),
    ]);
    if (!presa[0].meta.changes) continue; // un altro giro l'ha già preso
    if (!presa[1].meta.changes) {
      // Preso, ma un giro sovrapposto ha speso nel frattempo: il tetto non c'è più. Il lavoro diventa fermo
      // (l'aggiornamento dei fermi qui sotto non guarda lo stato) e il giro non spende niente. I lavori dopo
      // ripassano dallo stesso controllo in D1: un Haiku che sta ancora sotto il tetto parte lo stesso.
      fermi.push(job.id);
      continue;
    }
    speso += massimo;
    try {
      const r = await def.esegui(env, job, imp, now);
      const costo = costoMicros(r.uso, r.modello, imp);
      speso += costo - massimo;
      await db.batch([
        chiudiUso(db, idUso, r.uso, r.modello, costo, false),
        db.prepare("UPDATE ai_jobs SET stato = 'pronto', errore = NULL, finished_at = ?1 WHERE id = ?2").bind(now, job.id),
      ]);
      esito.fatti++;
    } catch (e) {
      // Un errore che non viene da Claude (per esempio la validazione dopo una risposta riuscita) non dice quanto
      // è costato: come una chiamata interrotta, conta il costo massimo, mai zero.
      const generico = !(e instanceof ErroreClaude);
      const err = generico ? new ErroreClaude((e as Error).message, usoVuoto(), stima.modello, false, true) : (e as ErroreClaude);
      const costo = err.interrotta ? massimo : costoMicros(err.uso, err.modello, imp);
      const ancora = !generico && err.ritentabile && job.tentativi + 1 < MAX_TENTATIVI;
      speso += costo - massimo;
      await db.batch([
        costo > 0
          ? chiudiUso(db, idUso, err.uso, err.interrotta ? stima.modello : err.modello, costo, err.interrotta)
          : db.prepare("DELETE FROM claude_usage WHERE id = ?1").bind(idUso),
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
      titolo: `L'assistente si è fermato: tetto di ${euroTondi(imp.tettoCents)} raggiunto`,
      testo: "I lavori ripartono il primo del mese, oppure alzando il tetto in Impostazioni.",
      href: "/impostazioni/integrazioni/claude",
    }, now);
    esito.fermi = fermi.length;
  }
  if (esito.errori && !esito.fatti) await segnaErrore(getDb(db), "claude", "Lavori dell'assistente non riusciti", now);
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
