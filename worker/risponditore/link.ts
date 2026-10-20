import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { igPost } from "./graph";
import { leggiToken } from "./token";

// Secondo passo: la persona ha toccato il pulsante, le mandiamo il link alla risorsa (una scheda con immagine e pulsante). Arriva sempre, anche se
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
  const url = `${base}/r/${campagna.risorsaSlug}`;
  const risorsa = await env.DB.prepare("SELECT titolo FROM risorse WHERE slug = ?").bind(campagna.risorsaSlug).first<{ titolo: string }>();
  // Prima la scheda (immagine, titolo, pulsante); se Instagram la rifiuta, il testo semplice di sempre: il link arriva comunque.
  let esito = await igPost(env, account.token, "/me/messages", {
    recipient: { id: autoreId },
    message: messaggioScheda({ base, url, slug: campagna.risorsaSlug, titolo: risorsa?.titolo ?? "", testoLink: campagna.testoLink }),
  });
  if (!esito.ok) {
    console.warn("risponditore_link: scheda non accettata, mando il testo", esito.codice);
    esito = await igPost(env, account.token, "/me/messages", {
      recipient: { id: autoreId },
      message: { text: `${campagna.testoLink}\n\n${url}` },
    });
  }
  if (!esito.ok) {
    console.warn("risponditore_link: invio non riuscito", esito.codice);
    return;
  }
  await env.DB.prepare(`UPDATE risp_eventi SET stato = 'link_inviato', aggiornato_il = ? WHERE commento_id = ?`).bind(now, evento.commento_id).run();
}

// Taglio pulito per i campi della scheda (Instagram accetta al massimo 80 caratteri): si chiude sull'ultima parola intera
// e si aggiunge "…"; se c'è una prima frase che ci sta tutta, si usa quella.
export function taglia(testo: string, max = 80): string {
  const t = testo.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const frase = /^(.+?[.!?])\s/.exec(t);
  if (frase && frase[1].length <= max && frase[1].length >= max / 3) return frase[1];
  const corto = t.slice(0, max - 1);
  const spazio = corto.lastIndexOf(" ");
  return `${(spazio > max / 2 ? corto.slice(0, spazio) : corto).replace(/[\s,;:.]+$/, "")}…`;
}

// L'etichetta del pulsante (al massimo 20 caratteri): "Apri lo schema" se la risorsa è uno schema, altrimenti "Apri la guida".
export const etichettaApri = (slug: string, titolo: string) => (/schema/i.test(`${slug} ${titolo}`) ? "Apri lo schema" : "Apri la guida");

export function messaggioScheda(d: { base: string; url: string; slug: string; titolo: string; testoLink: string }) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{
          title: taglia(d.titolo || "La risorsa del video"),
          subtitle: taglia(d.testoLink),
          image_url: `${d.base}/brand/scheda-risorsa.png`,
          default_action: { type: "web_url", url: d.url },
          buttons: [{ type: "web_url", url: d.url, title: etichettaApri(d.slug, d.titolo) }],
        }],
      },
    },
  };
}
