import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { sheetSyncState } from "../db/schema";
import type { Env } from "../env";
import { googleFetch } from "./fetcher";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const testo = (s: string) => b64url(new TextEncoder().encode(s));

function pemInDer(pem: string): Uint8Array {
  const corpo = pem.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0));
}

// Spec 6.1: JWT RS256 firmato con Web Crypto, scope in sola lettura (il CRM non scrive mai nel foglio).
export async function firmaJwt(email: string, pem: string, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const corpo = `${testo(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${testo(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  }))}`;
  const chiave = await crypto.subtle.importKey("pkcs8", pemInDer(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chiave, new TextEncoder().encode(corpo)));
  return `${corpo}.${b64url(firma)}`;
}

const CACHE_MS = 55 * 60_000;

// Il token dura un'ora: si firma una volta e si tiene in D1 per 55 minuti (spec 16.2).
export async function tokenGoogle(env: Env, db: Db, now: number): Promise<string> {
  const riga = await db.select({ cache: sheetSyncState.tokenCache }).from(sheetSyncState).where(eq(sheetSyncState.id, "foglio-andrea")).get();
  const cache = riga?.cache ? (JSON.parse(riga.cache) as { token: string; scade: number }) : null;
  if (cache && cache.scade > now) return cache.token;
  const assertion = await firmaJwt(env.GOOGLE_SA_EMAIL, env.GOOGLE_SA_PRIVATE_KEY, now);
  const r = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Token Google ${r.status}: ${j.error_description ?? "risposta senza token"}`);
  await db.update(sheetSyncState).set({ tokenCache: JSON.stringify({ token: j.access_token, scade: now + CACHE_MS }) }).where(eq(sheetSyncState.id, "foglio-andrea"));
  return j.access_token;
}
