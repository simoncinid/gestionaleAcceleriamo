import { Hono } from "hono";
import type { CoachSalvato } from "../claude/coach";
import { accoda } from "../claude/coda";
import type { AppEnv } from "../env";

// Spec 6.7: "Chiedi al coach" accoda il lavoro, il giro di Claude lo prepara, la scheda lead legge lo stato.
// Montate sotto /api: passano dalla sessione come tutte le altre (401 senza).
export const coachRoutes = new Hono<AppEnv>();
export const analisiRoutes = new Hono<AppEnv>();

export type StatoCoach = "nessuno" | "in_coda" | "in_corso" | "pronto" | "errore" | "fermo_tetto";
export type CoachApi = { id: string | null; stato: StatoCoach; risultato: CoachSalvato | null; errore: string | null; jobId: string | null };
export type Precompilato = { stageId: string | null; nextAction: string; nextActionAt: number; note: string };

// L'ultima analisi della call più il suo lavoro: lo stato vivo del lavoro (in corso, fermo per il tetto) decide
// prima dello stato salvato, tranne quando i suggerimenti sono già pronti o falliti.
async function statoCoach(db: D1Database, callId: string): Promise<CoachApi> {
  const a = await db.prepare(`SELECT a.id, a.status, a.result, a.error,
      (SELECT j.id FROM ai_jobs j WHERE j.tipo = 'coach' AND j.entity_id = a.id ORDER BY j.created_at DESC LIMIT 1) AS jobId,
      (SELECT j.stato FROM ai_jobs j WHERE j.tipo = 'coach' AND j.entity_id = a.id ORDER BY j.created_at DESC LIMIT 1) AS jobStato
      FROM call_analyses a WHERE a.call_id = ?1 ORDER BY a.created_at DESC LIMIT 1`)
    .bind(callId).first<{ id: string; status: string; result: string | null; error: string | null; jobId: string | null; jobStato: string | null }>();
  if (!a) return { id: null, stato: "nessuno", risultato: null, errore: null, jobId: null };
  const stato: StatoCoach =
    a.status === "ready" ? "pronto"
    : a.status === "error" ? "errore"
    : a.jobStato === "fermo_tetto" ? "fermo_tetto"
    : a.jobStato === "in_corso" || a.status === "running" ? "in_corso"
    : "in_coda";
  return { id: a.id, stato, risultato: a.result ? (JSON.parse(a.result) as CoachSalvato) : null, errore: a.error, jobId: a.jobId };
}

coachRoutes.get("/:id/coach", async (c) => c.json(await statoCoach(c.env.DB, c.req.param("id"))));

coachRoutes.post("/:id/coach", async (c) => {
  const callId = c.req.param("id");
  const k = await c.env.DB.prepare(`SELECT k.lead_id AS leadId, k.outcome FROM calls k JOIN leads l ON l.id = k.lead_id
      WHERE k.id = ?1 AND k.deleted_at IS NULL AND l.deleted_at IS NULL`).bind(callId).first<{ leadId: string; outcome: string | null }>();
  if (!k) return c.json({ error: "Call non trovata" }, 404);
  if (k.outcome !== "fatta") return c.json({ error: "Il coach legge solo le call fatte" }, 409);
  const attuale = await statoCoach(c.env.DB, callId);
  // Un lavoro già vivo (in coda, in corso, fermo per il tetto) non si raddoppia.
  if (attuale.stato === "in_coda" || attuale.stato === "in_corso" || attuale.stato === "fermo_tetto") return c.json(attuale);
  const now = Date.now();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO call_analyses (id, lead_id, call_id, status, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)").bind(id, k.leadId, callId, now).run();
  await accoda(c.env.DB, { tipo: "coach", entityId: id, leadId: k.leadId, chi: c.get("user").id }, now);
  return c.json(await statoCoach(c.env.DB, callId));
});

// "Applica i suggerimenti": restituisce il Foglio Esito precompilato e registra chi l'ha aperto.
// Il lead non cambia qui: cambia solo con "Salva esito".
analisiRoutes.post("/:id/applica", async (c) => {
  const id = c.req.param("id");
  const a = await c.env.DB.prepare("SELECT result FROM call_analyses WHERE id = ?1 AND status = 'ready'").bind(id).first<{ result: string }>();
  if (!a) return c.json({ error: "Suggerimenti non pronti" }, 409);
  const r = JSON.parse(a.result) as CoachSalvato;
  await c.env.DB.prepare("UPDATE call_analyses SET confirmed_by = ?1, confirmed_at = ?2 WHERE id = ?3").bind(c.get("user").id, Date.now(), id).run();
  const precompilato: Precompilato = { stageId: r.faseSuggerita, nextAction: r.prossimaAzione.testo, nextActionAt: r.prossimaAzioneAt, note: `Dal coach: ${r.riassunto}` };
  return c.json({ precompilato });
});
