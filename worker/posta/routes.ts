import { Hono } from "hono";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { mailSchema, smistaMail } from "./service";

// Porta del lettore della casella tommaso@acceleriamo.it (scripts/posta/leggi_posta.py): una mail per chiamata.
// Chiave: MAIL_HOOK_KEY (wrangler secret put). Senza chiave giusta risponde 401 e non scrive niente.
export const postaRoutes = new Hono<AppEnv>();
const MASSIMO = 160 * 1024;

async function chiaveGiusta(data: string | undefined, attesa: string | undefined) {
  if (!data || !attesa) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(data)), crypto.subtle.digest("SHA-256", enc.encode(attesa))]).then((d) => d.map((x) => new Uint8Array(x)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

postaRoutes.post("/", async (c) => {
  const chiave = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
  if (!(await chiaveGiusta(chiave, c.env.MAIL_HOOK_KEY))) return c.json({ error: "Chiave non valida" }, 401);
  if (c.env.SPAZIO === "demo") return c.json({ error: "Spazio demo: la posta non entra" }, 409);
  const testo = Number(c.req.header("content-length") ?? 0) > MASSIMO ? null : await c.req.text();
  if (testo == null || new TextEncoder().encode(testo).byteLength > MASSIMO) return c.json({ error: "Mail oltre 160 KB" }, 413);
  let grezzo: unknown;
  try { grezzo = JSON.parse(testo); } catch { grezzo = null; }
  const v = mailSchema.safeParse(grezzo);
  if (!v.success) return c.json({ error: v.error.issues[0]?.message ?? "Mail non valida" }, 400);
  const db = getDb(c.env.DB);
  const now = Date.now();
  try {
    const r = await smistaMail(c.env, v.data, now);
    await segnaOk(db, "posta", now);
    return c.json(r, r.nuova ? 201 : 200);
  } catch (e) {
    await segnaErrore(db, "posta", e instanceof Error ? e.message : String(e), now);
    throw e;
  }
});
