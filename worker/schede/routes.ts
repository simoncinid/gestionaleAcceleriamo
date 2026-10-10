import { Hono } from "hono";
import { z } from "zod";
import type { Fonte } from "../claude/client";
import { accoda } from "../claude/coda";
import { nuovaVersioneScheda } from "../claude/scheda";
import type { AppEnv } from "../env";
import { paginaStampa } from "./stampa";

export type StatoScheda = "nessuna" | "in_coda" | "in_corso" | "pronta" | "errore" | "privato" | "fermo_tetto";
export type SchedaApi = {
  stato: StatoScheda; versione: number | null; contenuto: string | null; fonti: Fonte[]; modello: string | null;
  aggiornata: number | null; errore: string | null; motivo: string | null; jobId: string | null;
};

export const schedeRoutes = new Hono<AppEnv>();

type Riga = { id: string; version: number; status: string; content: string | null; sources: string | null; model: string | null; error: string | null; classification: string | null; updatedAt: number };
type Lavoro = { id: string; stato: string; errore: string | null };

const leggiJson = <T>(s: string | null, vuoto: T): T => {
  if (!s) return vuoto;
  try {
    return JSON.parse(s) as T;
  } catch {
    return vuoto;
  }
};

// Lo stato della scheda dall'ultima versione e dal suo lavoro. Senza versioni guarda la classificazione:
// se è in coda o ferma per il tetto, la scheda è "in coda" o "ferma", altrimenti "nessuna".
export async function statoScheda(db: D1Database, leadId: string): Promise<SchedaApi> {
  const p = await db.prepare(`SELECT id, version, status, content, sources, model, error, classification, updated_at AS updatedAt
    FROM company_profiles WHERE lead_id = ?1 ORDER BY version DESC LIMIT 1`).bind(leadId).first<Riga>();
  const vuota: SchedaApi = { stato: "nessuna", versione: null, contenuto: null, fonti: [], modello: null, aggiornata: null, errore: null, motivo: null, jobId: null };
  if (!p) {
    const cls = await db.prepare("SELECT stato FROM ai_jobs WHERE tipo = 'classificazione' AND entity_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(leadId).first<{ stato: string }>();
    if (cls?.stato === "in_coda" || cls?.stato === "in_corso") return { ...vuota, stato: "in_coda" };
    if (cls?.stato === "fermo_tetto") return { ...vuota, stato: "fermo_tetto" };
    return vuota;
  }
  const job = await db.prepare("SELECT id, stato, errore FROM ai_jobs WHERE tipo = 'scheda' AND entity_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(p.id).first<Lavoro>();
  // Il lavoro decide finché è vivo: dopo "Riprova" la versione resta in errore ma il lavoro è di nuovo in coda.
  const stato: StatoScheda =
    p.error === "privato" ? "privato"
    : p.status === "ready" ? "pronta"
    : job?.stato === "fermo_tetto" ? "fermo_tetto"
    : job?.stato === "in_corso" || (p.status === "running" && job?.stato !== "in_coda") ? "in_corso"
    : job?.stato === "in_coda" ? "in_coda"
    : p.status === "error" || job?.stato === "errore" ? "errore"
    : "in_coda";
  const cls = leggiJson<{ motivo?: string } | null>(p.classification, null);
  return {
    stato, versione: p.version, contenuto: stato === "pronta" ? p.content : null, fonti: stato === "pronta" ? leggiJson<Fonte[]>(p.sources, []) : [],
    modello: p.model, aggiornata: p.updatedAt,
    errore: stato === "errore" ? (job?.errore ?? p.error) : null,
    motivo: stato === "privato" ? (cls?.motivo ?? null) : null,
    jobId: job?.id ?? null,
  };
}

schedeRoutes.get("/:id/scheda-azienda", async (c) => c.json(await statoScheda(c.env.DB, c.req.param("id"))));

// "Prepara la scheda", "Prepara comunque" e "Rigenera": sempre una versione nuova, la vecchia resta nello storico.
// Senza forza una scheda già in coda o in preparazione non si raddoppia.
schedeRoutes.post("/:id/scheda-azienda", async (c) => {
  const leadId = c.req.param("id");
  const { forza } = z.object({ forza: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
  const lead = await c.env.DB.prepare("SELECT id FROM leads WHERE id = ?1 AND deleted_at IS NULL").bind(leadId).first();
  if (!lead) return c.json({ error: "Lead non trovato" }, 404);
  const attuale = await statoScheda(c.env.DB, leadId);
  if (!forza && (attuale.stato === "in_coda" || attuale.stato === "in_corso")) return c.json(attuale);
  const now = Date.now();
  const profilo = await nuovaVersioneScheda(c.env.DB, leadId, now);
  await accoda(c.env.DB, { tipo: "scheda", entityId: profilo, leadId, chi: c.get("user").id, forzato: true }, now);
  return c.json(await statoScheda(c.env.DB, leadId));
});

schedeRoutes.get("/:id/scheda-azienda/stampa", async (c) => {
  const leadId = c.req.param("id");
  const l = await c.env.DB.prepare("SELECT company FROM leads WHERE id = ?1 AND deleted_at IS NULL").bind(leadId).first<{ company: string }>();
  const s = await statoScheda(c.env.DB, leadId);
  if (!l || !s.contenuto) return c.text("Scheda non ancora pronta", 404);
  return c.html(paginaStampa(l.company, s.contenuto, s.fonti, s.aggiornata ?? Date.now()));
});
