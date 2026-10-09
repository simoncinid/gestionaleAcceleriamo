import type { Env } from "../env";
import { cifra, intestazioneVapid } from "./cifra";
import { pushFetch } from "./fetcher";

export type DatiPush = { titolo: string; testo?: string; href?: string; tag?: string };
export type EsitoPush = "ok" | "sparita" | "errore";

// Senza le due chiavi le push restano spente: stato "Non collegato", nessun errore all'utente.
export const pushCollegate = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// 404 e 410: il browser ha tolto l'iscrizione. Ogni altro problema (rete, chiavi rovinate) è "errore", mai un'eccezione.
export async function mandaPush(env: Env, sub: { endpoint: string; p256dh: string; auth: string }, dati: DatiPush, now: number): Promise<EsitoPush> {
  try {
    const corpo = await cifra(new TextEncoder().encode(JSON.stringify(dati)), sub.p256dh, sub.auth);
    const r = await pushFetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await intestazioneVapid(sub.endpoint, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.VAPID_SOGGETTO || "https://acceleriamo-os.acceleriamo-os.workers.dev", now),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body: corpo,
    });
    if (r.status === 404 || r.status === 410) return "sparita";
    return r.ok ? "ok" : "errore";
  } catch {
    return "errore";
  }
}
