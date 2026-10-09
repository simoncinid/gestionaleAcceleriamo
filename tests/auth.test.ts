import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
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
