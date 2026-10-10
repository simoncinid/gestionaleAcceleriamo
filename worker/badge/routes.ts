import { Hono } from "hono";
import { spesoDelMese } from "../claude/coda";
import { microsDaCents } from "../claude/costo";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { leggiImpostazioni } from "../impostazioni/service";
import { inizioGiornoRoma, meseRoma } from "../lib/roma";
import { calcolaOggi } from "../today/routes";

export const badgeRoutes = new Hono<AppEnv>();

// Spec 5.3: il badge conta cose da fare, non cose nuove; un lead conta una volta. A zero sparisce (lo fa il componente).
// Il numero del Commerciale è lo stesso del titolo di Oggi ("Mie"): stessa funzione, stesse righe.
badgeRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const ora = Date.now();
  const io = c.get("user").id;
  const [commerciale, economia, rotta, avvisi, speso, imp] = await Promise.all([
    calcolaOggi(db, io, "mie", ora),
    // Come statoFattura: in ritardo solo dal giorno dopo la scadenza, a giorno di Roma.
    db.prepare(`SELECT count(*) n FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.deleted_at IS NULL AND i.paid_at IS NULL AND i.due_at < ? AND c.scope = 'acceleriamo'`).bind(inizioGiornoRoma(ora)).first<{ n: number }>(),
    db.prepare("SELECT count(*) n FROM integration_status WHERE ok = 0").first<{ n: number }>(),
    // Spec 8: avvisi aperti e non letti della persona; il punto sull'avatar li segnala.
    db.prepare("SELECT count(*) n FROM notifications WHERE user_id = ?1 AND closed_at IS NULL AND read_at IS NULL").bind(io).first<{ n: number }>(),
    spesoDelMese(db, meseRoma(ora)),
    leggiImpostazioni(getDb(db)),
  ]);
  // Spec 7.5: dal tetto di avviso (16 euro) solo il punto arancione sull'avatar; al tetto Claude si ferma.
  const claude = speso >= microsDaCents(imp.claude.tettoCents) ? "tetto" : speso >= microsDaCents(imp.claude.avvisoCents) ? "avviso" : "ok";
  const nonLetti = avvisi?.n ?? 0;
  return c.json({ commerciale: commerciale.totale, economia: economia?.n ?? 0, avvisi: nonLetti, avatar: (rotta?.n ?? 0) > 0 || nonLetti > 0 || claude !== "ok", claude });
});
