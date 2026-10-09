import type { Env } from "../env";
import { emailFetch } from "./fetcher";

export type Esito = { ok: true; id: string } | { ok: false; errore: string; ritentabile: boolean };

// Ogni email che esce dall'applicazione chiude con questa riga.
export const PIEDE_LEGALE = "Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505";
export const CHIAVE_MANCANTE = "Chiave Resend mancante";

// La riga legale non compare mai due volte: se il testo la contiene già (anche nel piede delle Impostazioni) resta com'è.
export const conPiede = (testo: string) => (testo.includes(PIEDE_LEGALE) ? testo : `${testo.trimEnd()}\n\n${PIEDE_LEGALE}`);

export async function inviaEmail(
  env: Env,
  m: { from: string; to: string; replyTo?: string; subject: string; text: string; allegati?: { filename: string; content: string }[]; chiave?: string },
): Promise<Esito> {
  if (!env.RESEND_API_KEY) return { ok: false, errore: CHIAVE_MANCANTE, ritentabile: false };
  const headers: Record<string, string> = { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" };
  if (m.chiave) headers["idempotency-key"] = m.chiave;
  try {
    const r = await emailFetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: m.from, to: [m.to], reply_to: m.replyTo, subject: m.subject, text: conPiede(m.text), attachments: m.allegati }),
    });
    const corpo = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (r.ok && corpo.id) return { ok: true, id: corpo.id };
    // 409 sulla chiave di idempotenza: la stessa email è già partita (risposta persa o doppio invio). Non è un errore.
    if (r.status === 409 && m.chiave && /idempot/i.test(`${corpo.name ?? ""} ${corpo.message ?? ""}`)) return { ok: true, id: corpo.id ?? "" };
    return { ok: false, errore: `Resend ${r.status}: ${corpo.message ?? "risposta senza id"}`, ritentabile: r.status === 429 || r.status >= 500 };
  } catch (e) {
    return { ok: false, errore: `Resend non raggiungibile: ${(e as Error).message}`, ritentabile: true };
  }
}

// "Tommaso di Acceleriamo <tommaso@mail.acceleriamo.it>" -> "tommaso@mail.acceleriamo.it"; un indirizzo nudo resta com'è.
export function indirizzoDi(mittente: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(mittente);
  return (m ? m[1] : mittente).trim();
}

// Base64 di un testo UTF-8: btoa da solo si rompe sulle lettere accentate.
export function base64Utf8(testo: string): string {
  let binario = "";
  for (const b of new TextEncoder().encode(testo)) binario += String.fromCharCode(b);
  return btoa(binario);
}
