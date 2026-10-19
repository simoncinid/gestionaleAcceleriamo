import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { igAccount } from "../db/schema";
import type { Env } from "../env";

export type TokenInstagram = { igUserId: string; username: string; token: string; scadeIl: number };

const ID = "principale";

const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const daBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Chiave AES-GCM da IG_TOKEN_KEY (32 byte in base64). Chiave assente o malformata: null.
async function chiave(env: Env): Promise<CryptoKey | null> {
  if (!env.IG_TOKEN_KEY) return null;
  try {
    const raw = daBase64(env.IG_TOKEN_KEY);
    if (raw.length !== 32) return null;
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export async function salvaToken(env: Env, t: TokenInstagram, now: number): Promise<void> {
  const k = await chiave(env);
  if (!k) throw new Error("IG_TOKEN_KEY mancante o non valida");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrato = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(t.token)));
  const out = new Uint8Array(iv.length + cifrato.length);
  out.set(iv);
  out.set(cifrato, iv.length);
  const valori = { igUserId: t.igUserId, username: t.username, tokenCifrato: base64(out), scadeIl: t.scadeIl, rinnovatoIl: now, ultimoErrore: null };
  await drizzle(env.DB).insert(igAccount).values({ id: ID, ...valori }).onConflictDoUpdate({ target: igAccount.id, set: valori });
}

export async function leggiToken(env: Env): Promise<TokenInstagram | null> {
  const k = await chiave(env);
  if (!k) return null;
  const riga = await drizzle(env.DB).select().from(igAccount).where(eq(igAccount.id, ID)).get();
  if (!riga) return null;
  try {
    const dati = daBase64(riga.tokenCifrato);
    const chiaro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dati.slice(0, 12) }, k, dati.slice(12));
    return { igUserId: riga.igUserId, username: riga.username, token: new TextDecoder().decode(chiaro), scadeIl: riga.scadeIl };
  } catch {
    return null;
  }
}
