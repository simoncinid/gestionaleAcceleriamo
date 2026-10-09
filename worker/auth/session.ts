import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, SessionUser } from "../env";

export const SESSION_COOKIE = "sid";
export const SESSION_DAYS = 30;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(db: D1Database, userId: string, now = Date.now()) {
  const token = randomToken();
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, expiresAt, now)
    .run();
  return { token, expiresAt };
}

export async function readSession(db: D1Database, token: string, now = Date.now()): Promise<SessionUser | null> {
  return db
    .prepare(
      "SELECT u.id, u.username, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1",
    )
    .bind(await sha256Hex(token), now)
    .first<SessionUser>();
}

export async function deleteSession(db: D1Database, token: string) {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await readSession(c.env.DB, token) : null;
  if (!user) return c.json({ error: "Non autenticato" }, 401);
  c.set("user", user);
  await next();
};
