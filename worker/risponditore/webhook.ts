import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { verifyMetaSignature } from "../meta/signature";
import { autoreFb, trattaCommento } from "./commenti";
import { mandaLink } from "./link";

type Payload = {
  entry?: {
    messaging?: { sender?: { id?: string }; postback?: { payload?: string } }[];
    changes?: {
      field?: string;
      value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string }; parent_id?: string };
    }[];
  }[];
};

export const webhookInstagram = new Hono<AppEnv>();

webhookInstagram.get("/", (c) => {
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (c.req.query("hub.mode") === "subscribe" && token && c.env.IG_VERIFY_TOKEN && token === c.env.IG_VERIFY_TOKEN && challenge) return c.text(challenge);
  return c.json({ error: "Verifica non valida" }, 403);
});

webhookInstagram.post("/", async (c) => {
  const raw = await c.req.text();
  const firma = c.req.header("x-hub-signature-256");
  const valida =
    (c.env.IG_APP_SECRET ? await verifyMetaSignature(raw, firma, c.env.IG_APP_SECRET) : false) ||
    (await verifyMetaSignature(raw, firma, c.env.META_APP_SECRET));
  if (!valida) return c.json({ error: "Firma non valida" }, 401);
  // Spazio demo: risponde 200 e non fa nulla.
  if (c.env.SPAZIO === "demo") return c.json({ ok: true });
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return c.json({ error: "JSON non valido" }, 400);
  }
  const env = c.env;
  const lavoro = async () => {
    for (const entry of payload.entry ?? []) {
      for (const m of entry.messaging ?? []) {
        const payload = m.postback?.payload;
        if (!m.sender?.id || typeof payload !== "string" || !payload.startsWith("RISORSA:")) continue;
        try {
          await mandaLink(env, String(m.sender.id), payload.slice("RISORSA:".length), Date.now());
        } catch (err) {
          console.error("risponditore_link", err instanceof Error ? err.message : "errore");
        }
      }
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (change.field !== "comments" || !v?.id || !v.media?.id) continue;
        try {
          await trattaCommento(
            env,
            { id: String(v.id), testo: v.text ?? "", autoreId: v.from?.id ? String(v.from.id) : null, autoreNome: v.from?.username ?? null, mediaId: String(v.media.id), parentId: v.parent_id ? String(v.parent_id) : null },
            Date.now(),
          );
        } catch (err) {
          console.error("risponditore_commento", err);
        }
      }
    }
  };
  c.executionCtx.waitUntil(lavoro());
  return c.json({ ok: true });
});

// Pagina Facebook: gli avvisi arrivano nel webhook dei lead (/api/webhooks/meta, oggetto page). Qui solo i commenti
// nuovi (feed, item comment, verb add) e i tocchi su Messenger; i leadgen restano a meta/routes.ts.
export type AvvisoPagina = {
  messaging?: { sender?: { id?: string }; postback?: { payload?: string } }[];
  changes?: {
    field?: string;
    value?: { item?: string; verb?: string; comment_id?: string; post_id?: string; parent_id?: string; message?: string; from?: { id?: string; name?: string } };
  }[];
};

// C'è lavoro per il risponditore? Serve a non aprire waitUntil per i soli lead.
export const haLavoroPagina = (entry: AvvisoPagina[]) =>
  entry.some((e) => (e.messaging?.length ?? 0) > 0 || (e.changes ?? []).some((ch) => ch.field === "feed"));

export async function lavoroPagina(env: Env, entry: AvvisoPagina[]): Promise<void> {
  for (const e of entry) {
    for (const m of e.messaging ?? []) {
      const p = m.postback?.payload;
      if (!m.sender?.id || typeof p !== "string" || !p.startsWith("RISORSA:")) continue;
      // RISORSA:<campagna>:<commento>: il PSID di chi tocca non è l'autore del commento.
      const resto = p.slice("RISORSA:".length);
      const due = resto.indexOf(":");
      if (due <= 0 || due === resto.length - 1) continue;
      try {
        await mandaLink(env, String(m.sender.id), resto.slice(0, due), Date.now(), { piattaforma: "fb", commentoId: resto.slice(due + 1) });
      } catch (err) {
        console.error("risponditore_link", err instanceof Error ? err.message : "errore");
      }
    }
    for (const ch of e.changes ?? []) {
      const v = ch.value;
      if (ch.field !== "feed" || v?.item !== "comment" || v.verb !== "add" || !v.comment_id || !v.post_id) continue;
      // Un commento diretto al post ha parent_id uguale al post: è una risposta solo se il genitore è un altro commento.
      const parentId = v.parent_id && v.parent_id !== v.post_id ? String(v.parent_id) : null;
      try {
        await trattaCommento(
          env,
          { id: String(v.comment_id), testo: v.message ?? "", autoreId: autoreFb(v.from?.id, v.comment_id), autoreNome: v.from?.name ?? null, mediaId: String(v.post_id), parentId, piattaforma: "fb" },
          Date.now(),
        );
      } catch (err) {
        console.error("risponditore_commento", err instanceof Error ? err.message : "errore");
      }
    }
  }
}
