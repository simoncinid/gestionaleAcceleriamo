import { Hono } from "hono";
import type { AiTipo } from "../db/schema";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { leggiImpostazioni } from "../impostazioni/service";
import { meseRoma } from "../lib/roma";
import { centsDaMicros, type ImpClaude } from "./costo";

export type UsoClaudeApi = {
  mese: string;
  collegato: boolean;
  spesoCents: number;
  tettoCents: number;
  avvisoCents: number;
  fermi: number;
  perTipo: { tipo: AiTipo; lavori: number; costoCents: number }[];
  modelli: ImpClaude["modelli"];
};

export const claudeRoutes = new Hono<AppEnv>();
export const aiJobsRoutes = new Hono<AppEnv>();

// Spec 7.5: quanto è stato speso nel mese (di Roma), per funzione.
claudeRoutes.get("/usage", async (c) => {
  const q = c.req.query("mese");
  const mese = q && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : meseRoma(Date.now());
  const [imp, righe, fermi] = await Promise.all([
    leggiImpostazioni(getDb(c.env.DB)),
    c.env.DB.prepare("SELECT tipo, count(*) lavori, sum(costo_micros) micros FROM claude_usage WHERE mese = ?1 GROUP BY tipo ORDER BY tipo").bind(mese).all<{ tipo: AiTipo; lavori: number; micros: number }>(),
    c.env.DB.prepare("SELECT count(*) n FROM ai_jobs WHERE stato = 'fermo_tetto'").first<{ n: number }>(),
  ]);
  // Il totale si arrotonda una volta sola, sui micro-dollari sommati.
  const micros = righe.results.reduce((s, r) => s + r.micros, 0);
  const out: UsoClaudeApi = {
    mese,
    collegato: Boolean(c.env.ANTHROPIC_API_KEY),
    spesoCents: centsDaMicros(micros),
    tettoCents: imp.claude.tettoCents,
    avvisoCents: imp.claude.avvisoCents,
    fermi: fermi?.n ?? 0,
    perTipo: righe.results.map((r) => ({ tipo: r.tipo, lavori: r.lavori, costoCents: centsDaMicros(r.micros) })),
    modelli: imp.claude.modelli,
  };
  return c.json(out);
});

// "Riprova" (spec 7.4): un lavoro in errore torna in coda con i tentativi azzerati.
aiJobsRoutes.post("/:id/riprova", async (c) => {
  const r = await c.env.DB.prepare("UPDATE ai_jobs SET stato = 'in_coda', tentativi = 0, errore = NULL, errore_id = NULL WHERE id = ?1 AND stato = 'errore'").bind(c.req.param("id")).run();
  if (!r.meta.changes) {
    const c2 = await c.env.DB.prepare("SELECT stato FROM ai_jobs WHERE id = ?1").bind(c.req.param("id")).first<{ stato: string }>();
    if (!c2) return c.json({ error: "Lavoro non trovato" }, 404);
  }
  return c.json({ ok: true });
});
