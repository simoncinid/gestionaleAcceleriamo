import type { Env } from "../env";
import { cifra, intestazioneVapid } from "./cifra";
import { pushFetch } from "./fetcher";

export type DatiPush = { titolo: string; testo?: string; href?: string; tag?: string };
// ok: consegnata. sparita: 404 o 410, il browser ha tolto l'iscrizione. errore: rifiutata o chiavi rovinate, non si ritenta.
// ritenta: 5xx o rete giù, si riprova al giro dopo e conta come errore del dispositivo.
// occupato: 429, si riprova al giro dopo senza contare un errore.
export type EsitoPush = "ok" | "sparita" | "errore" | "ritenta" | "occupato";

// Senza le due chiavi le push restano spente: stato "Non collegato", nessun errore all'utente.
export const pushCollegate = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// 404 e 410: il browser ha tolto l'iscrizione. Ogni altro problema (rete, chiavi rovinate) è "errore", mai un'eccezione.
export async function mandaPush(env: Env, sub: { endpoint: string; p256dh: string; auth: string }, dati: DatiPush, now: number): Promise<EsitoPush> {
  let corpo: Uint8Array;
  let firma: string;
  try {
    corpo = await cifra(new TextEncoder().encode(JSON.stringify(dati)), sub.p256dh, sub.auth);
    firma = await intestazioneVapid(sub.endpoint, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.VAPID_SOGGETTO || "https://acceleriamo-os.acceleriamo-os.workers.dev", now);
  } catch {
    return "errore";
  }
  try {
    const r = await pushFetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: firma,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "21600", // 6 ore, come VECCHIO della consegna: dopo non serve più
        Urgency: "high",
      },
      body: corpo,
    });
    if (r.status === 404 || r.status === 410) return "sparita";
    if (r.status === 429) return "occupato";
    if (r.status >= 500) return "ritenta";
    return r.ok ? "ok" : "errore";
  } catch {
    return "ritenta";
  }
}

// Scrittura sul dispositivo dopo un invio: ok azzera gli errori, sparita cancella, 429 non tocca niente,
// gli altri errori contano e al terzo di fila il dispositivo è "rotto".
export function scritturaDispositivo(db: D1Database, id: string, esito: EsitoPush, now: number): D1PreparedStatement | null {
  if (esito === "ok") return db.prepare("UPDATE push_subscriptions SET errori = 0, last_ok_at = ?1 WHERE id = ?2").bind(now, id);
  if (esito === "sparita") return db.prepare("DELETE FROM push_subscriptions WHERE id = ?1").bind(id);
  if (esito === "occupato") return null;
  return db.prepare("UPDATE push_subscriptions SET errori = errori + 1, rotta = CASE WHEN errori + 1 >= 3 THEN 1 ELSE 0 END WHERE id = ?1").bind(id);
}
