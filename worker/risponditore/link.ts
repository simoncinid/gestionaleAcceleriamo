import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { graphPost, leggiCanale, type EsitoGraph } from "./graph";
import { GRAFICHE, type Grafiche } from "./grafiche-risorse";
import { firmaGrafiche, minutiLettura, passiSchema } from "../../src/pagine/pubbliche/corpoRisorsa";

// Secondo passo: la persona ha toccato il pulsante, le mandiamo la risorsa. Arriva sempre, anche se non ci segue.
// Campagna sconosciuta o nessun messaggio precedente: non parte nulla (una riga di log, senza segreti).
//
// Primo tocco: una riga di testo (testoLink, scritta come da una persona) e una scheda sola con l'anteprima della risorsa
// e il pulsante per aprirla. Tocchi successivi: solo la scheda, la riga non si ripete.
// L'anteprima disegnata (public/risorse/<slug>/anteprima.png, vedi grafiche-risorse.ts) vale solo se titolo e passi di oggi
// sono quelli da cui è nata; altrimenti la scheda usa l'immagine generica del brand.
// Riserva: scheda rifiutata, il testo con il link. Lo stato link_inviato si scrive una volta sola, quando il link è arrivato.
// Su Facebook (fb) destinatarioId è il PSID di Messenger e l'evento si trova dal commento scritto nel payload del pulsante.
export async function mandaLink(env: Env, destinatarioId: string, campagnaId: string, now: number, fb?: { piattaforma: "fb"; commentoId: string }): Promise<void> {
  const campagna = await drizzle(env.DB).select().from(rispCampagne).where(eq(rispCampagne.id, campagnaId)).get();
  if (!campagna) {
    console.warn("risponditore_link: campagna sconosciuta", campagnaId);
    return;
  }
  const evento = await (fb
    ? env.DB.prepare(
      `SELECT commento_id, stato, aggiornato_il FROM risp_eventi WHERE commento_id = ? AND campagna_id = ? AND piattaforma = 'fb' AND stato IN ('inviato','link_inviato')`,
    ).bind(fb.commentoId, campagnaId)
    : env.DB.prepare(
      `SELECT commento_id, stato, aggiornato_il FROM risp_eventi WHERE campagna_id = ? AND autore_id = ? AND piattaforma = 'ig' AND stato IN ('inviato','link_inviato')
       ORDER BY aggiornato_il DESC, creato_il DESC LIMIT 1`,
    ).bind(campagnaId, destinatarioId)
  ).first<{ commento_id: string; stato: string; aggiornato_il: number }>();
  if (!evento) {
    console.warn("risponditore_link: nessun messaggio precedente per la campagna", campagnaId);
    return;
  }
  const canale = await leggiCanale(env, fb ? "fb" : "ig");
  if (!canale) {
    console.warn(fb ? "risponditore_link: Pagina Facebook non collegata" : "risponditore_link: account Instagram non collegato");
    return;
  }
  const slug = campagna.risorsaSlug;
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  const url = `${base}/r/${slug}`;
  const risorsa = await env.DB.prepare("SELECT titolo, corpo FROM risorse WHERE slug = ?").bind(slug).first<{ titolo: string; corpo: string }>();
  const invia = (message: unknown) => graphPost(env, canale, `/${canale.mittente}/messages`, { recipient: { id: destinatarioId }, message });

  // Primo tocco: lo si prende con un aggiornamento condizionato, così due tocchi ravvicinati non mandano due righe.
  let primo = false;
  if (evento.stato === "inviato") {
    const presa = await env.DB.prepare(`UPDATE risp_eventi SET aggiornato_il = ? WHERE commento_id = ? AND stato = 'inviato' AND aggiornato_il = ?`)
      .bind(now, evento.commento_id, evento.aggiornato_il)
      .run();
    primo = (presa.meta.changes ?? 0) > 0;
  }

  const riga = campagna.testoLink.trim();
  let rigaArrivata = false;
  if (primo && riga) {
    const r = await invia({ text: riga });
    rigaArrivata = r.ok;
    if (!r.ok) console.warn("risponditore_link: riga non accettata", r.codice);
  }
  let esito = await invia(messaggioScheda({ base, url, slug, titolo: risorsa?.titolo ?? "", corpo: risorsa?.corpo ?? "" }));
  if (!esito.ok) {
    console.warn("risponditore_link: scheda non accettata, mando il testo", esito.codice);
    esito = await invia({ text: rigaArrivata || !riga ? url : `${riga}\n\n${url}` });
  }
  if (!esito.ok) {
    console.warn("risponditore_link: invio non riuscito", esito.codice);
    return;
  }
  await env.DB.prepare(`UPDATE risp_eventi SET stato = 'link_inviato', aggiornato_il = ? WHERE commento_id = ? AND stato = 'inviato'`)
    .bind(now, evento.commento_id)
    .run();
}

// Le grafiche generate (sostituibili nei test, come metaFetch).
let grafiche: Record<string, Grafiche> = GRAFICHE;
export const setGrafiche = (g: Record<string, Grafiche> | null) => {
  grafiche = g ?? GRAFICHE;
};

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

// L'immagine della scheda: l'anteprima disegnata per la risorsa se è ancora valida, altrimenti quella generica del brand.
// La stessa immagine fa da anteprima del link nelle chat (og:image della pagina, vedi worker/risorse/pagina.ts).
export function immagineRisorsa(base: string, slug: string, titolo: string, corpo: string): string {
  const g = grafiche[slug];
  if (g && g.firma === firmaGrafiche(titolo, passiSchema(corpo))) return `${base}/risorse/${slug}/anteprima.png?v=${g.v}`;
  return `${base}/brand/scheda-risorsa.png`;
}

// Riga sotto il titolo della scheda: quanti passaggi e quanto si legge, così la persona sa cosa sta aprendo.
export function righinaScheda(corpo: string): string {
  const n = passiSchema(corpo).length;
  const m = minutiLettura(corpo);
  const lettura = `si legge in ${m} ${m === 1 ? "minuto" : "minuti"}`;
  return n >= 2 ? `${n} passaggi, ${lettura}` : lettura.charAt(0).toUpperCase() + lettura.slice(1);
}

export function messaggioScheda(d: { base: string; url: string; slug: string; titolo: string; corpo: string }) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{
          title: taglia(d.titolo || "La risorsa del video"),
          subtitle: taglia(righinaScheda(d.corpo)),
          image_url: immagineRisorsa(d.base, d.slug, d.titolo, d.corpo),
          default_action: { type: "web_url", url: d.url },
          buttons: [{ type: "web_url", url: d.url, title: etichettaApri(d.slug, d.titolo) }],
        }],
      },
    },
  };
}
