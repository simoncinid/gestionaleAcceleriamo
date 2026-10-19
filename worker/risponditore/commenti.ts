import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
import { rispCampagne, type RispEvento } from "../db/schema";
import { igPost } from "./graph";
import { scegliCampagna } from "./parola";
import { leggiToken } from "./token";

export type Commento = { id: string; testo: string; autoreId: string | null; autoreNome: string | null; mediaId: string; parentId: string | null };

async function chiudi(env: Env, id: string, stato: RispEvento["stato"], now: number, extra: { motivo?: string | null; campagnaId?: string; rispostaPubblicaId?: string | null; errore?: boolean } = {}) {
  await env.DB.prepare(
    `UPDATE risp_eventi SET stato = ?, motivo = ?, campagna_id = COALESCE(?, campagna_id), risposta_pubblica_id = COALESCE(?, risposta_pubblica_id),
     tentativi = tentativi + ?, aggiornato_il = ? WHERE commento_id = ?`,
  )
    .bind(stato, extra.motivo ?? null, extra.campagnaId ?? null, extra.rispostaPubblicaId ?? null, extra.errore ? 1 : 0, now, id)
    .run();
}

export async function trattaCommento(env: Env, c: Commento, now: number): Promise<RispEvento["stato"]> {
  const account = await leggiToken(env);
  // 1. Niente autore, commento nostro o risposta a un altro commento: si scarta senza scrivere.
  if (!c.autoreId || c.parentId || c.autoreId === account?.igUserId) return "ignorato";

  // 2. Un solo trattamento per commento: Meta rimanda gli avvisi.
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, stato, tentativi, creato_il, aggiornato_il)
     VALUES (?, ?, ?, ?, ?, 'in_corso', 0, ?, ?)`,
  )
    .bind(c.id, c.mediaId, c.autoreId, c.autoreNome, c.testo, now, now)
    .run();
  if (!ins.meta.changes) return "ignorato";

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

  if (!account) {
    await chiudi(env, c.id, "errore", now, { campagnaId: campagna.id, motivo: "Account Instagram non collegato", errore: true });
    return "errore";
  }

  // 5. Risposta pubblica: se fallisce si va avanti col privato.
  let varianti: string[] = [];
  try {
    varianti = JSON.parse(campagna.rispostepubbliche);
  } catch {
    /* campagna senza varianti leggibili: niente risposta pubblica */
  }
  let motivo: string | null = null;
  let rispostaPubblicaId: string | null = null;
  if (varianti.length) {
    const message = varianti[Math.floor(Math.random() * varianti.length)];
    const pub = await igPost(env, account.token, `/${c.id}/replies`, { message });
    if (pub.ok) rispostaPubblicaId = pub.dati?.id ? String(pub.dati.id) : null;
    else motivo = `Risposta pubblica non riuscita: ${pub.messaggio}`;
  }

  // 6. Messaggio privato con il pulsante.
  const priv = await igPost(env, account.token, "/me/messages", {
    recipient: { comment_id: c.id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: campagna.testoPrivato,
          buttons: [{ type: "postback", title: campagna.etichettaPulsante, payload: `RISORSA:${campagna.id}` }],
        },
      },
    },
  });
  if (!priv.ok) {
    await chiudi(env, c.id, "errore", now, { campagnaId: campagna.id, motivo: priv.messaggio, rispostaPubblicaId, errore: true });
    return "errore";
  }

  // 7. Fatto.
  await chiudi(env, c.id, "inviato", now, { campagnaId: campagna.id, motivo, rispostaPubblicaId });
  return "inviato";
}
