import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
import { rispCampagne, type RispCampagna, type RispEvento } from "../db/schema";
import { MOTIVO_FB_NON_COLLEGATO, MOTIVO_NON_COLLEGATO, motivoErrore, registraFallimento } from "./errori";
import { graphPost, leggiCanale, type Canale, type EsitoGraph, type Piattaforma } from "./graph";
import { scegliCampagna } from "./parola";

// piattaforma assente: Instagram. Su Facebook mediaId è l'id del post e parentId c'è solo per le risposte in thread.
export type Commento = { id: string; testo: string; autoreId: string | null; autoreNome: string | null; mediaId: string; parentId: string | null; piattaforma?: Piattaforma };

async function chiudi(env: Env, id: string, stato: RispEvento["stato"], now: number, extra: { motivo?: string | null; campagnaId?: string; rispostaPubblicaId?: string | null; errore?: boolean } = {}) {
  await env.DB.prepare(
    `UPDATE risp_eventi SET stato = ?, motivo = ?, campagna_id = COALESCE(?, campagna_id), risposta_pubblica_id = COALESCE(?, risposta_pubblica_id),
     tentativi = tentativi + ?, aggiornato_il = ? WHERE commento_id = ?`,
  )
    .bind(stato, extra.motivo ?? null, extra.campagnaId ?? null, extra.rispostaPubblicaId ?? null, extra.errore ? 1 : 0, now, id)
    .run();
}

// Facebook spesso non dice chi ha commentato (niente `from`, sia nel recupero sia su certe inserzioni): il commento
// vale lo stesso e l'autore diventa il commento. Il link dopo il tocco si aggancia comunque al commento.
export const autoreFb = (id: string | null | undefined, commentoId: string): string => (id ? String(id) : `commento:${commentoId}`);

export async function trattaCommento(env: Env, c: Commento, now: number): Promise<RispEvento["stato"]> {
  const piattaforma = c.piattaforma ?? "ig";
  const canale = await leggiCanale(env, piattaforma);
  // La Pagina si riconosce dall'id anche senza token: i suoi commenti non diventano mai eventi.
  const proprioId = piattaforma === "fb" ? env.META_PAGE_ID : canale?.proprioId;
  if (!c.autoreId || c.parentId || c.autoreId === proprioId) return "ignorato";
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, stato, tentativi, piattaforma, creato_il, aggiornato_il)
     VALUES (?, ?, ?, ?, ?, 'in_corso', 0, ?, ?, ?)`,
  )
    .bind(c.id, c.mediaId, c.autoreId, c.autoreNome, c.testo, piattaforma, now, now)
    .run();
  if (!ins.meta.changes) return "ignorato";
  try {
    return await lavora(env, c, piattaforma, canale, now);
  } catch (err) {
    const motivo = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    await chiudi(env, c.id, "errore", now, { motivo, errore: true });
    return "errore";
  }
}

async function lavora(env: Env, c: Commento, piattaforma: Piattaforma, canale: Canale | null, now: number): Promise<RispEvento["stato"]> {
  // 3. Campagna.
  const campagne = await drizzle(env.DB).select().from(rispCampagne).all();
  const campagna = scegliCampagna(campagne, c.mediaId, c.testo);
  if (!campagna) {
    await chiudi(env, c.id, "ignorato", now, { motivo: "nessuna parola chiave" });
    return "ignorato";
  }

  // 4. Una sola volta per persona, campagna e post.
  const gia = await env.DB.prepare(
    `SELECT 1 FROM risp_eventi WHERE campagna_id = ? AND autore_id = ? AND media_id = ? AND stato IN ('inviato','link_inviato') AND commento_id != ? LIMIT 1`,
  )
    .bind(campagna.id, c.autoreId, c.mediaId, c.id)
    .first();
  if (gia) {
    await chiudi(env, c.id, "ignorato", now, { campagnaId: campagna.id, motivo: "già risposto a questa persona" });
    return "ignorato";
  }

  if (!canale) {
    const motivo = piattaforma === "fb" ? MOTIVO_FB_NON_COLLEGATO : MOTIVO_NON_COLLEGATO;
    await chiudi(env, c.id, "errore", now, { campagnaId: campagna.id, motivo, errore: true });
    return "errore";
  }

  // 5. Risposta pubblica: se fallisce si va avanti col privato.
  let varianti: unknown = null;
  try {
    varianti = JSON.parse(campagna.rispostepubbliche);
  } catch {
    /* illeggibile: gestito sotto */
  }
  let motivo: string | null = null;
  let rispostaPubblicaId: string | null = null;
  if (!Array.isArray(varianti) || !varianti.length) {
    motivo = "Risposte pubbliche mancanti o non leggibili";
  } else {
    const message = String(varianti[Math.floor(Math.random() * varianti.length)]);
    // Instagram risponde con /replies, Facebook con /comments sul commento.
    const pub = await graphPost(env, canale, `/${c.id}/${piattaforma === "fb" ? "comments" : "replies"}`, { message });
    if (pub.ok) rispostaPubblicaId = pub.dati?.id ? String(pub.dati.id) : null;
    else motivo = `Risposta pubblica non riuscita: ${pub.messaggio}`;
  }

  // 6. Messaggio privato con il pulsante.
  const priv = await inviaPrivato(env, canale, campagna, c.id);
  if (!priv.ok) {
    await registraFallimento(env, c.id, motivoErrore(priv.codice, priv.messaggio, piattaforma).motivo, now, { campagnaId: campagna.id, rispostaPubblicaId });
    return "errore";
  }

  // 7. Fatto.
  await chiudi(env, c.id, "inviato", now, { campagnaId: campagna.id, motivo, rispostaPubblicaId });
  return "inviato";
}

// Passo 6, anche per il giro dei ritentativi: il messaggio privato in risposta al commento, con il pulsante.
// Su Messenger chi tocca ha un id (PSID) diverso dall'autore del commento: il payload porta anche il commento.
export function inviaPrivato(env: Env, canale: Canale, campagna: RispCampagna, commentoId: string): Promise<EsitoGraph> {
  const payload = canale.piattaforma === "fb" ? `RISORSA:${campagna.id}:${commentoId}` : `RISORSA:${campagna.id}`;
  return graphPost(env, canale, `/${canale.mittente}/messages`, {
    recipient: { comment_id: commentoId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: campagna.testoPrivato,
          buttons: [{ type: "postback", title: campagna.etichettaPulsante, payload }],
        },
      },
    },
  });
}
