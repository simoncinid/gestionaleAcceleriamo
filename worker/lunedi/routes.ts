import { Hono } from "hono";
import { z } from "zod";
import { accoda } from "../claude/coda";
import type { AppEnv } from "../env";
import { revisioneCorrente, type NumeriSettimana } from "./calcolo";

export const lunediRoutes = new Hono<AppEnv>();

export type RevisioneApi = {
  id: string;
  settimana: string;
  numeri: NumeriSettimana;
  decisioni: [string, string, string];
  commento: string | null;
  commentoStato: "nessuno" | "in_coda" | "in_corso" | "pronto" | "errore" | "fermo_tetto";
  chiusaDa: string | null;
  chiusaAt: number | null;
};

// Lo stato del commento viene dall'ultimo lavoro di Claude per questa revisione: due query in tutto.
async function leggi(db: D1Database, id: string): Promise<RevisioneApi | null> {
  const r = await db.prepare("SELECT id, settimana, numeri, decisioni, commento, chiusa_da AS chiusaDa, chiusa_at AS chiusaAt FROM weekly_reviews WHERE id = ?1").bind(id)
    .first<{ id: string; settimana: string; numeri: string; decisioni: string; commento: string | null; chiusaDa: string | null; chiusaAt: number | null }>();
  if (!r) return null;
  const job = await db.prepare("SELECT stato FROM ai_jobs WHERE tipo = 'commento' AND entity_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(id).first<{ stato: string }>();
  return {
    ...r,
    numeri: JSON.parse(r.numeri) as NumeriSettimana,
    decisioni: JSON.parse(r.decisioni) as [string, string, string],
    commentoStato: r.commento ? "pronto" : ((job?.stato ?? "nessuno") as RevisioneApi["commentoStato"]),
  };
}

lunediRoutes.get("/corrente", async (c) => {
  const { id } = await revisioneCorrente(c.env.DB, Date.now());
  return c.json(await leggi(c.env.DB, id));
});

const modifica = z.object({ decisioni: z.tuple([z.string().max(300), z.string().max(300), z.string().max(300)]).optional(), chiudi: z.literal(true).optional() }).strict();

lunediRoutes.patch("/:id", async (c) => {
  const p = modifica.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: "Dati non validi" }, 400);
  const r = await leggi(c.env.DB, c.req.param("id"));
  if (!r) return c.json({ error: "Revisione non trovata" }, 404);
  if (r.chiusaAt) return c.json({ error: "La revisione è già chiusa" }, 409);
  const now = Date.now();
  await c.env.DB.prepare(`UPDATE weekly_reviews SET decisioni = COALESCE(?1, decisioni), chiusa_da = COALESCE(?2, chiusa_da), chiusa_at = COALESCE(?3, chiusa_at), updated_at = ?4 WHERE id = ?5`)
    .bind(p.data.decisioni ? JSON.stringify(p.data.decisioni) : null, p.data.chiudi ? c.get("user").id : null, p.data.chiudi ? now : null, now, r.id).run();
  return c.json(await leggi(c.env.DB, r.id));
});

lunediRoutes.post("/:id/commento", async (c) => {
  const r = await leggi(c.env.DB, c.req.param("id"));
  if (!r) return c.json({ error: "Revisione non trovata" }, 404);
  if (r.commentoStato !== "in_coda" && r.commentoStato !== "in_corso") {
    await c.env.DB.prepare("UPDATE weekly_reviews SET commento = NULL WHERE id = ?1").bind(r.id).run();
    await accoda(c.env.DB, { tipo: "commento", entityId: r.id, chi: c.get("user").id, forzato: true }, Date.now());
  }
  return c.json(await leggi(c.env.DB, r.id));
});
