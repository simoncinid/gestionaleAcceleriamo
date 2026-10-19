import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { igPost } from "./graph";
import { leggiToken } from "./token";

// Secondo passo: la persona ha toccato il pulsante, le mandiamo il link alla risorsa. Arriva sempre, anche se
// non ci segue (l'invito a seguirci sta dentro testoLink). Un secondo tocco rimanda il link senza cambiare altro.
// Campagna sconosciuta o nessun messaggio precedente a quella persona: non parte nulla (solo una riga di log, senza segreti).
export async function mandaLink(env: Env, autoreId: string, campagnaId: string, now: number): Promise<void> {
  const campagna = await drizzle(env.DB).select().from(rispCampagne).where(eq(rispCampagne.id, campagnaId)).get();
  if (!campagna) {
    console.warn("risponditore_link: campagna sconosciuta", campagnaId);
    return;
  }
  const evento = await env.DB.prepare(
    `SELECT commento_id FROM risp_eventi WHERE campagna_id = ? AND autore_id = ? AND stato IN ('inviato','link_inviato')
     ORDER BY aggiornato_il DESC, creato_il DESC LIMIT 1`,
  )
    .bind(campagnaId, autoreId)
    .first<{ commento_id: string }>();
  if (!evento) {
    console.warn("risponditore_link: nessun messaggio precedente per la campagna", campagnaId);
    return;
  }
  const account = await leggiToken(env);
  if (!account) {
    console.warn("risponditore_link: account Instagram non collegato");
    return;
  }
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  const esito = await igPost(env, account.token, "/me/messages", {
    recipient: { id: autoreId },
    message: { text: `${campagna.testoLink}\n\n${base}/r/${campagna.risorsaSlug}` },
  });
  if (!esito.ok) {
    console.warn("risponditore_link: invio non riuscito", esito.codice);
    return;
  }
  await env.DB.prepare(`UPDATE risp_eventi SET stato = 'link_inviato', aggiornato_il = ? WHERE commento_id = ?`).bind(now, evento.commento_id).run();
}
