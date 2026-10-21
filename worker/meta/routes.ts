import { Hono } from "hono";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { fillMetaLead, registerMetaLead } from "./ingest";
import { verifyMetaSignature } from "./signature";
import { scriviEsiti } from "../stato/service";
import { VOCE_WEBHOOK_META } from "../stato/voci";

type Payload = { entry?: { changes?: { field?: string; value?: { leadgen_id?: string | number; form_id?: string | number } }[] }[] };

export const metaRoutes = new Hono<AppEnv>();

metaRoutes.get("/", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token && token === c.env.META_VERIFY_TOKEN && challenge) return c.text(challenge);
  return c.json({ error: "Verifica non valida" }, 403);
});

metaRoutes.post("/", async (c) => {
  const raw = await c.req.text();
  const db = getDb(c.env.DB);
  const now = Date.now();
  // Pagina Stato: la voce del webhook segna l'ultimo lead ricevuto e l'ultimo errore di firma o di lettura.
  const segna = (esito: "ok" | "errore", messaggio: string, passo: string | null = null) =>
    scriviEsiti(db, [{ voce: VOCE_WEBHOOK_META, esito, messaggio, passo }], now);
  if (!(await verifyMetaSignature(raw, c.req.header("x-hub-signature-256"), c.env.META_APP_SECRET))) {
    await segna("errore", "Notifica con firma non valida: controllare il segreto dell'app Meta", "firma");
    return c.json({ error: "Firma non valida" }, 401);
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    await segna("errore", "Notifica firmata ma illeggibile", "lettura");
    return c.json({ error: "JSON non valido" }, 400);
  }
  let ricevuti = 0;
  const created: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      ricevuti++;
      const id = await registerMetaLead(
        db,
        { leadgenId: String(change.value.leadgen_id), formId: change.value.form_id ? String(change.value.form_id) : null },
        now,
      );
      if (id) created.push(id);
    }
  }
  if (ricevuti) await segna("ok", created.length ? `${created.length} lead nuovi su ${ricevuti} ricevuti` : `${ricevuti} lead già registrati`);
  if (created.length) c.executionCtx.waitUntil(Promise.all(created.map((id) => fillMetaLead(c.env, id))));
  return c.json({ ok: true, created: created.length });
});
