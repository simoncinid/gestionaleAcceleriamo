import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";

export const avvisiRoutes = new Hono<AppEnv>();

avvisiRoutes.get("/", async (c) => {
  const io = c.get("user").id;
  const r = await c.env.DB.prepare(`SELECT id, evento, titolo, testo, href, created_at AS createdAt, read_at AS readAt
    FROM notifications WHERE user_id = ?1 AND closed_at IS NULL ORDER BY created_at DESC LIMIT 50`).bind(io)
    .all<{ id: string; evento: string; titolo: string; testo: string | null; href: string | null; createdAt: number; readAt: number | null }>();
  const avvisi = r.results.map(({ readAt, ...a }) => ({ ...a, letto: readAt != null }));
  return c.json({ avvisi, nonLetti: avvisi.filter((a) => !a.letto).length });
});

avvisiRoutes.post("/letti", async (c) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(50).optional() }).parse(await c.req.json().catch(() => ({})));
  const io = c.get("user").id;
  const now = Date.now();
  if (ids?.length) {
    await c.env.DB.prepare(`UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL AND id IN (${ids.map((_, i) => `?${i + 3}`).join(",")})`).bind(now, io, ...ids).run();
  } else {
    await c.env.DB.prepare("UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL AND closed_at IS NULL").bind(now, io).run();
  }
  return c.json({ ok: true });
});
