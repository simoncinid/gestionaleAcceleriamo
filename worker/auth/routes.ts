import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { verifyPassword } from "./password";
import { SESSION_COOKIE, SESSION_DAYS, createSession, deleteSession } from "./session";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Scrivi l'utente"),
  password: z.string().min(1, "Scrivi la password"),
});

type UserRow = { id: string; username: string; name: string; password_hash: string; active: number; failed_logins: number; locked_until: number | null };

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const { username, password } = loginSchema.parse(await c.req.json());
  const now = Date.now();
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
  if (!user || !user.active) return c.json({ error: "Utente o password sbagliati" }, 401);
  if (user.locked_until && user.locked_until > now) {
    const minutes = Math.ceil((user.locked_until - now) / 60_000);
    return c.json({ error: `Troppi tentativi sbagliati, riprova tra ${minutes} minuti` }, 429);
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    const failed = user.failed_logins + 1;
    const lock = failed >= MAX_FAILED ? now + LOCK_MS : null;
    await c.env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(lock ? 0 : failed, lock, user.id)
      .run();
    return c.json({ error: "Utente o password sbagliati" }, 401);
  }
  await c.env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
  const { token } = await createSession(c.env.DB, user.id, now);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86_400 });
  return c.json({ user: { id: user.id, username: user.username, name: user.name } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
  return c.json({ ok: true });
});

authRoutes.get("/me", (c) => c.json({ user: c.get("user") }));
