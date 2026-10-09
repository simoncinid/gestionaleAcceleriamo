import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { hashPassword } from "../worker/auth/password";

export async function call(path: string, init: RequestInit & { json?: unknown } = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const ctx = createExecutionContext();
  const req = new Request(`https://test.local${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export async function createUser(username = "tommaso", password = "password-lunga-1", name = "Tommaso") {
  await env.DB.prepare(
    "INSERT INTO users (id, username, name, password_hash, active, failed_logins, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)",
  )
    .bind(username, username, name, await hashPassword(password, 1000), Date.now())
    .run();
}

export async function loginCookie(username = "tommaso", password = "password-lunga-1") {
  const res = await call("/api/auth/login", { method: "POST", json: { username, password } });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

export async function authed() {
  await createUser();
  return loginCookie();
}
