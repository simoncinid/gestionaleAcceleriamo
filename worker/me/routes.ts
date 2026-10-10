import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password";
import { idSessione, SESSION_COOKIE } from "../auth/session";
import { EVENTI } from "../avvisi/eventi";
import type { Silenzio } from "../avvisi/silenzio";
import { getDb } from "../db/client";
import { EVENTI_AVVISO, type EventoAvviso } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";

export type Profilo = { id: string; name: string; username: string; telegram: boolean; notifyPrefs: Record<EventoAvviso, boolean>; quietHours: Silenzio; dispositivi: number };

const ORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Scrivi le ore nel formato 22:00");
const silenzio = z.object({ attive: z.boolean(), da: ORA, a: ORA }).strict();
const SILENZIO_SPENTO: Silenzio = { attive: false, da: "22:00", a: "07:30" };
const modifica = z.object({
  name: z.string().trim().min(2, "Il nome ha almeno 2 lettere").max(60, "Il nome ha al massimo 60 caratteri").optional(),
  notifyPrefs: z.record(z.enum(EVENTI_AVVISO), z.boolean()).optional(),
  quietHours: silenzio.optional(),
}).strict();
const password = z.object({
  attuale: z.string().min(1, "Scrivi la password attuale").max(200),
  nuova: z.string().min(10, "La nuova password ha almeno 10 caratteri").max(200, "La nuova password ha al massimo 200 caratteri"),
}).strict();

type Riga = { id: string; name: string; username: string; telegram_chat_id: string | null; notify_prefs: string | null; quiet_hours: string | null };

// Un JSON rovinato nel profilo vale come "niente impostato" (come nella consegna del Task 3), mai un errore.
function leggiJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Assente = acceso (Task 1): qui si restituisce sempre l'elenco completo degli eventi.
const preferenze = (json: string | null) => {
  const salvate = leggiJson<Partial<Record<EventoAvviso, boolean>>>(json) ?? {};
  return Object.fromEntries((Object.keys(EVENTI) as EventoAvviso[]).map((e) => [e, salvate[e] !== false])) as Record<EventoAvviso, boolean>;
};

const silenzioDa = (json: string | null): Silenzio => {
  const s = silenzio.safeParse(leggiJson(json));
  return s.success ? s.data : SILENZIO_SPENTO;
};

// 2 query: la persona e i suoi dispositivi push ancora raggiungibili.
async function profilo(db: D1Database, id: string): Promise<Profilo> {
  const [u, d] = await Promise.all([
    db.prepare("SELECT id, name, username, telegram_chat_id, notify_prefs, quiet_hours FROM users WHERE id = ?1").bind(id).first<Riga>(),
    db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?1 AND rotta = 0").bind(id).first<{ n: number }>(),
  ]);
  return {
    id: u!.id, name: u!.name, username: u!.username, telegram: u!.telegram_chat_id != null,
    notifyPrefs: preferenze(u!.notify_prefs),
    quietHours: silenzioDa(u!.quiet_hours),
    dispositivi: d?.n ?? 0,
  };
}

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/profilo", async (c) => c.json(await profilo(c.env.DB, c.get("user").id)));

meRoutes.patch("/", async (c) => {
  const p = modifica.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Dati non validi" }, 400);
  const id = c.get("user").id;
  let prefs: string | null = null;
  if (p.data.notifyPrefs) {
    const u = await c.env.DB.prepare("SELECT notify_prefs FROM users WHERE id = ?1").bind(id).first<{ notify_prefs: string | null }>();
    prefs = JSON.stringify({ ...preferenze(u?.notify_prefs ?? null), ...p.data.notifyPrefs });
  }
  await c.env.DB.prepare("UPDATE users SET name = COALESCE(?1, name), notify_prefs = COALESCE(?2, notify_prefs), quiet_hours = COALESCE(?3, quiet_hours) WHERE id = ?4")
    .bind(p.data.name ?? null, prefs, p.data.quietHours ? JSON.stringify(p.data.quietHours) : null, id).run();
  return c.json(await profilo(c.env.DB, id));
});

meRoutes.post("/password", async (c) => {
  const p = password.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Dati non validi" }, 400);
  const id = c.get("user").id;
  const u = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?1").bind(id).first<{ password_hash: string }>();
  if (!u || !(await verifyPassword(p.data.attuale, u.password_hash))) return c.json({ error: "La password attuale non è giusta" }, 400);
  const sessione = await idSessione(getCookie(c, SESSION_COOKIE) ?? "");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?1 WHERE id = ?2").bind(await hashPassword(p.data.nuova), id),
    // Chi ha la password vecchia esce da tutti gli altri dispositivi.
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1 AND id <> ?2").bind(id, sessione),
  ]);
  await audit(getDb(c.env.DB), id, "user", id, "password", null);
  return c.json({ ok: true });
});
