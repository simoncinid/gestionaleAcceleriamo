import { Hono } from "hono";
import type { AppEnv } from "../env";
import { daRoma, partiRoma } from "../lib/roma";

export const badgeRoutes = new Hono<AppEnv>();

// Spec 5.3: il badge conta cose da fare, non cose nuove; un lead conta una volta. A zero sparisce (lo fa il componente).
badgeRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const ora = Date.now();
  const p = partiRoma(ora);
  const fine = daRoma(p.anno, p.mese, p.giorno + 1);
  const io = c.get("user").id;
  const [commerciale, economia, rotta] = await Promise.all([
    db.prepare(`SELECT count(*) n FROM leads l JOIN stages s ON s.id = l.stage_id
      WHERE l.deleted_at IS NULL AND s.kind = 'open' AND (l.owner_id = ?1 OR l.owner_id IS NULL) AND (
        (l.stage_id = 'da-chiamare-prima-volta' AND l.attempt_count = 0)
        OR (l.next_action_at IS NOT NULL AND l.next_action_at < ?2)
        OR (l.stage_id = 'in-attesa-decisione' AND l.next_action_at < ?3))`).bind(io, ora, fine).first<{ n: number }>(),
    db.prepare(`SELECT count(*) n FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.deleted_at IS NULL AND i.paid_at IS NULL AND i.due_at < ? AND c.scope = 'acceleriamo'`).bind(ora).first<{ n: number }>(),
    db.prepare("SELECT count(*) n FROM integration_status WHERE ok = 0").first<{ n: number }>(),
  ]);
  return c.json({ commerciale: commerciale?.n ?? 0, economia: economia?.n ?? 0, avatar: (rotta?.n ?? 0) > 0 });
});
