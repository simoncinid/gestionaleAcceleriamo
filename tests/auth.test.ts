import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { buildUserSql } from "../worker/auth/user-sql";
import { hashPassword, verifyPassword } from "../worker/auth/password";
import { authed, call, createUser, loginCookie } from "./helpers";

describe("password", () => {
  it("verifica la password giusta e rifiuta quella sbagliata", async () => {
    const stored = await hashPassword("ciao-mondo-123", 1000);
    expect(stored.startsWith("pbkdf2$1000$")).toBe(true);
    expect(await verifyPassword("ciao-mondo-123", stored)).toBe(true);
    expect(await verifyPassword("ciao-mondo-124", stored)).toBe(false);
    expect(await verifyPassword("x", "formato-strano")).toBe(false);
  });
});

describe("login", () => {
  it("senza sessione le API rispondono 401", async () => {
    const res = await call("/api/auth/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non autenticato" });
  });

  it("con utente e password giusti apre una sessione sicura", async () => {
    await createUser();
    const res = await call("/api/auth/login", { method: "POST", json: { username: "Tommaso ", password: "password-lunga-1" } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sid=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    const me = await call("/api/auth/me", {}, cookie.split(";")[0]);
    expect(await me.json()).toEqual({ user: { id: "tommaso", username: "tommaso", name: "Tommaso" } });
  });

  it("password sbagliata: 401 con messaggio generico", async () => {
    await createUser();
    const res = await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "no" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Utente o password sbagliati" });
  });

  it("dopo 5 tentativi sbagliati blocca anche la password giusta", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) {
      await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "no" } });
    }
    const res = await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "password-lunga-1" } });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/Troppi tentativi/);
  });

  it("tentativi sbagliati in parallelo contano tutti", async () => {
    await createUser();
    await Promise.all(
      Array.from({ length: 6 }, () => call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "no" } })),
    );
    const res = await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "password-lunga-1" } });
    expect(res.status).toBe(429);
  });

  it("logout chiude la sessione", async () => {
    const cookie = await authed();
    await call("/api/auth/logout", { method: "POST" }, cookie);
    expect((await call("/api/auth/me", {}, cookie)).status).toBe(401);
  });

  it("sessione scaduta: 401", async () => {
    const cookie = await authed();
    await env.DB.prepare("UPDATE sessions SET expires_at = 1").run();
    expect((await call("/api/auth/me", {}, cookie)).status).toBe(401);
  });

  it("utente disattivato: 401 anche con sessione aperta", async () => {
    const cookie = await loginAfterCreate();
    await env.DB.prepare("UPDATE users SET active = 0").run();
    expect((await call("/api/auth/me", {}, cookie)).status).toBe(401);
  });
});

async function loginAfterCreate() {
  await createUser();
  return loginCookie();
}

describe("buildUserSql", () => {
  it("hash con $ e nome con apostrofo arrivano intatti e permettono il login", async () => {
    const hash = await hashPassword("password-lunga-2", 1000);
    expect(hash).toContain("$");
    await env.DB.exec(buildUserSql(" Anna ", "Anna D'Angelo", hash).trim().replace(/\n+/g, "\n"));
    const row = await env.DB.prepare("SELECT name, password_hash FROM users WHERE id = 'anna'").first<{ name: string; password_hash: string }>();
    expect(row).toEqual({ name: "Anna D'Angelo", password_hash: hash });
    const res = await call("/api/auth/login", { method: "POST", json: { username: "anna", password: "password-lunga-2" } });
    expect(res.status).toBe(200);
  });

  it("riesecuzione per utente esistente chiude le sessioni", async () => {
    const cookie = await authed();
    const hash = await hashPassword("nuova-password-9", 1000);
    await env.DB.exec(buildUserSql("tommaso", "Tommaso", hash).trim());
    expect((await call("/api/auth/me", {}, cookie)).status).toBe(401);
    expect((await call("/api/auth/login", { method: "POST", json: { username: "tommaso", password: "nuova-password-9" } })).status).toBe(200);
  });
});
