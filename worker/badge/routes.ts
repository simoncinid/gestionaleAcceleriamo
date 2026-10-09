import { Hono } from "hono";
import type { AppEnv } from "../env";
import { inizioGiornoRoma } from "../lib/roma";
import { calcolaOggi } from "../today/routes";

export const badgeRoutes = new Hono<AppEnv>();

// Spec 5.3: il badge conta cose da fare, non cose nuove; un lead conta una volta. A zero sparisce (lo fa il componente).
// Il numero del Commerciale è lo stesso del titolo di Oggi ("Mie"): stessa funzione, stesse righe.
badgeRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const ora = Date.now();
  const io = c.get("user").id;
  const [commerciale, economia, rotta] = await Promise.all([
    calcolaOggi(db, io, "mie", ora),
    // Come statoFattura: in ritardo solo dal giorno dopo la scadenza, a giorno di Roma.
    db.prepare(`SELECT count(*) n FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.deleted_at IS NULL AND i.paid_at IS NULL AND i.due_at < ? AND c.scope = 'acceleriamo'`).bind(inizioGiornoRoma(ora)).first<{ n: number }>(),
    db.prepare("SELECT count(*) n FROM integration_status WHERE ok = 0").first<{ n: number }>(),
  ]);
  return c.json({ commerciale: commerciale.totale, economia: economia?.n ?? 0, avatar: (rotta?.n ?? 0) > 0 });
});
