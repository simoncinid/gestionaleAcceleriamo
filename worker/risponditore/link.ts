import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { igPost, type EsitoGraph } from "./graph";
import { GRAFICHE, type Grafiche } from "./grafiche-risorse";
import { firmaPassi, passiSchema, type Passo } from "../../src/pagine/pubbliche/corpoRisorsa";
import { leggiToken } from "./token";

// Secondo passo: la persona ha toccato il pulsante, le mandiamo la risorsa. Arriva sempre, anche se non ci segue
// (l'invito a seguirci sta dentro testoLink). Campagna sconosciuta o nessun messaggio precedente: non parte nulla (una riga di log, senza segreti).
//
// Con le grafiche generate per la risorsa (vedi grafiche-risorse.ts) e la firma dei passi ancora uguale:
//   primo tocco: una riga (testoLink), l'animazione dello schema, il carosello con una scheda per passo e la chiamata in fondo;
//   tocchi successivi: solo il carosello.
// Catena di riserva: animazione rifiutata, si salta; carosello rifiutato, la scheda singola; scheda rifiutata, il testo con il link.
// Senza grafiche si parte direttamente dalla scheda singola. Lo stato link_inviato si scrive una volta sola, quando il link è arrivato.
export async function mandaLink(env: Env, autoreId: string, campagnaId: string, now: number): Promise<void> {
  const campagna = await drizzle(env.DB).select().from(rispCampagne).where(eq(rispCampagne.id, campagnaId)).get();
  if (!campagna) {
    console.warn("risponditore_link: campagna sconosciuta", campagnaId);
    return;
  }
  const evento = await env.DB.prepare(
    `SELECT commento_id, stato, aggiornato_il FROM risp_eventi WHERE campagna_id = ? AND autore_id = ? AND stato IN ('inviato','link_inviato')
     ORDER BY aggiornato_il DESC, creato_il DESC LIMIT 1`,
  )
    .bind(campagnaId, autoreId)
    .first<{ commento_id: string; stato: string; aggiornato_il: number }>();
  if (!evento) {
    console.warn("risponditore_link: nessun messaggio precedente per la campagna", campagnaId);
    return;
  }
  const account = await leggiToken(env);
  if (!account) {
    console.warn("risponditore_link: account Instagram non collegato");
    return;
  }
  const slug = campagna.risorsaSlug;
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  const url = `${base}/r/${slug}`;
  const risorsa = await env.DB.prepare("SELECT titolo, corpo FROM risorse WHERE slug = ?").bind(slug).first<{ titolo: string; corpo: string }>();
  const invia = (message: unknown) => igPost(env, account.token, "/me/messages", { recipient: { id: autoreId }, message });

  // Le grafiche valgono solo se i passi di oggi sono quelli da cui sono state disegnate.
  const passi = risorsa ? passiSchema(risorsa.corpo) : [];
  const g = grafiche[slug];
  const conGrafiche = !!g && passi.length > 0 && g.firma === firmaPassi(passi);

  // Primo tocco: lo si prende con un aggiornamento condizionato, così due tocchi ravvicinati non mandano due animazioni.
  let primo = false;
  if (evento.stato === "inviato") {
    const presa = await env.DB.prepare(`UPDATE risp_eventi SET aggiornato_il = ? WHERE commento_id = ? AND stato = 'inviato' AND aggiornato_il = ?`)
      .bind(now, evento.commento_id, evento.aggiornato_il)
      .run();
    primo = (presa.meta.changes ?? 0) > 0;
  }

  let esito: EsitoGraph | null = null;
  if (conGrafiche) {
    const d = { base, url, slug, titolo: risorsa?.titolo ?? "", passi, v: g.v };
    if (primo) {
      if (campagna.testoLink.trim()) {
        const riga = await invia({ text: campagna.testoLink.trim() });
        if (!riga.ok) console.warn("risponditore_link: riga non accettata", riga.codice);
      }
      if (g.video) {
        const video = await invia(messaggioAnimazione(d));
        if (!video.ok) console.warn("risponditore_link: animazione non accettata, la salto", video.codice);
      }
    }
    esito = await invia(messaggioCarosello(d));
    if (!esito.ok) console.warn("risponditore_link: carosello non accettato, mando la scheda", esito.codice);
  }
  if (!esito?.ok) {
    esito = await invia(messaggioScheda({ base, url, slug, titolo: risorsa?.titolo ?? "", testoLink: campagna.testoLink }));
    if (!esito.ok) {
      console.warn("risponditore_link: scheda non accettata, mando il testo", esito.codice);
      esito = await invia({ text: `${campagna.testoLink}\n\n${url}` });
    }
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

type DatiGrafiche = { base: string; url: string; slug: string; titolo: string; passi: Passo[]; v: string };
const fileGrafica = (d: DatiGrafiche, nome: string) => `${d.base}/risorse/${d.slug}/${nome}?v=${d.v}`;

// L'animazione dello schema: un MP4 muto, mandato come allegato video (Instagram accetta mp4 fino a 25 MB).
export const messaggioAnimazione = (d: DatiGrafiche) => ({ attachment: { type: "video", payload: { url: fileGrafica(d, "schema.mp4") } } });

// Il carosello: una scheda per passo (immagine disegnata, titolo del passo, la sua frase accorciata, pulsante al passo nella pagina)
// e in fondo la chiamata gratuita. Al massimo sette passi più la chiamata: Instagram ne accetta dieci.
export function messaggioCarosello(d: DatiGrafiche) {
  const apri = etichettaApri(d.slug, d.titolo);
  const scheda = (title: string, subtitle: string, immagine: string, ancora: string, pulsante: string) => {
    const link = `${d.url}#${ancora}`;
    return {
      title: taglia(title),
      subtitle: taglia(subtitle),
      image_url: fileGrafica(d, immagine),
      default_action: { type: "web_url", url: link },
      buttons: [{ type: "web_url", url: link, title: pulsante }],
    };
  };
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [
          ...d.passi.map((p) => scheda(p.titolo, p.descrizione || p.titolo, `passo-${p.numero}.png`, `passo-${p.numero}`, apri)),
          scheda("Chiamata gratuita", "Ti richiamiamo e guardiamo insieme come applicarlo alla tua azienda.", "chiamata.png", "chiamata", "Richiedi la chiamata"),
        ],
      },
    },
  };
}
