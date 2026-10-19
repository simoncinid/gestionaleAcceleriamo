import { Hono } from "hono";
import type { AppEnv } from "../env";
import { verifyMetaSignature } from "../meta/signature";
import { trattaCommento } from "./commenti";

type Payload = {
  entry?: {
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
