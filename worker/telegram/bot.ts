import { EVENTI } from "../avvisi/eventi";
import { canaleAcceso, inSilenzio } from "../avvisi/silenzio";
import type { EventoAvviso } from "../db/schema";
import type { Env } from "../env";
import { telegramFetch } from "./fetcher";

// Spec 8.4: il codice di collegamento vale 15 minuti; un avviso di più di 6 ore non serve più.
const VALIDITA_CODICE = 15 * 60_000;
const VECCHIO = 6 * 3_600_000;
// Collegamenti scritti in un giro: le due unità tenute per getUpdates e la conferma coprono due scritture.
const COLLEGAMENTI_PER_GIRO = 2;
// Solo i tre eventi della spec ("Lead nuovo", "SLA scaduto", "Claude al tetto"): letti dalla tabella degli eventi.
const EVENTI_TELEGRAM = (Object.keys(EVENTI) as EventoAvviso[]).filter((e) => EVENTI[e].telegram);
const IN_EVENTI = EVENTI_TELEGRAM.map((e) => `'${e}'`).join(",");

export const telegramCollegato = (env: Env) => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT);
const api = (env: Env, metodo: string) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${metodo}`;

// "ok" consegnato; "ritenta" Telegram giù, 429 o rete: si riprova al giro dopo (entro le 6 ore);
// "rifiutato" chat bloccata o sparita (4xx): riprovare non serve, l'avviso si segna.
type Esito = "ok" | "ritenta" | "rifiutato";

async function invia(env: Env, chatId: string, testo: string): Promise<Esito> {
  try {
    // Testo semplice, senza parse_mode: il nome di un'azienda non può diventare formattazione.
    const r = await telegramFetch(api(env, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: testo, disable_web_page_preview: true }),
    });
    if (r.ok) return "ok";
    return r.status === 429 || r.status >= 500 ? "ritenta" : "rifiutato";
  } catch {
    return "ritenta";
  }
}

export async function mandaTelegram(env: Env, chatId: string, testo: string): Promise<boolean> {
  return (await invia(env, chatId, testo)) === "ok";
}

export async function nuovoCodice(db: D1Database, userId: string, now: number): Promise<string> {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const codice = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await db.prepare("UPDATE users SET telegram_codice = ?1, telegram_codice_at = ?2 WHERE id = ?3").bind(codice, now, userId).run();
  return codice;
}

type InAttesa = { id: string; codice: string };
type Aggiornamento = { update_id: number; message?: { chat: { id: number }; text?: string } };

// Due sottorichieste: lettura e conferma (offset = primo non trattato, così Telegram non ripete i letti).
// Restituisce le scritture dei collegamenti (al massimo 2): le esegue il giro nella sua batch. Una lettura
// che non riesce non rompe niente: il codice resta valido e si riprova al giro dopo.
export async function leggiCollegamenti(env: Env, attesa: InAttesa[]): Promise<{ scritture: D1PreparedStatement[]; sottorichieste: number }> {
  let j: { ok: boolean; result: Aggiornamento[] };
  try {
    const r = await telegramFetch(api(env, "getUpdates") + "?timeout=0&allowed_updates=%5B%22message%22%5D");
    j = (await r.json()) as typeof j;
  } catch {
    return { scritture: [], sottorichieste: 1 };
  }
  if (!j?.ok || !Array.isArray(j.result) || !j.result.length) return { scritture: [], sottorichieste: 1 };
  const scritture: D1PreparedStatement[] = [];
  const usati = new Set<string>();
  let conferma = 0;
  for (const u of [...j.result].sort((a, b) => a.update_id - b.update_id)) {
    const m = /^\/start\s+(\S+)/.exec(u.message?.text ?? "");
    const chi = m && attesa.find((a) => a.codice === m[1] && !usati.has(a.id));
    if (chi && u.message) {
      // Oltre i collegamenti del giro: l'aggiornamento resta a Telegram e torna al giro dopo.
      if (scritture.length >= COLLEGAMENTI_PER_GIRO) break;
      usati.add(chi.id);
      scritture.push(env.DB.prepare("UPDATE users SET telegram_chat_id = ?1, telegram_codice = NULL, telegram_codice_at = NULL WHERE id = ?2")
        .bind(String(u.message.chat.id), chi.id));
    }
    conferma = u.update_id + 1;
  }
  try {
    await telegramFetch(api(env, "getUpdates") + `?timeout=0&offset=${conferma}`);
  } catch {
    // Conferma persa: gli stessi aggiornamenti tornano al giro dopo e il codice ormai cancellato non collega due volte.
  }
  return { scritture, sottorichieste: 2 };
}

type Riga = {
  codici: string;
  id: string | null;
  evento: EventoAvviso;
  titolo: string;
  testo: string | null;
  href: string | null;
  createdAt: number;
  chat: string;
  quiet: string | null;
  prefs: string | null;
  inCoda: number;
};

// Lavoro "telegram" del giro. Costo misurato con contaD1: una lettura sola (codici in attesa, avvisi da mandare
// e quanti sono in coda, tutto in una query) più una batch con una scrittura per collegamento, una per avviso
// trattato e una di pulizia (avvisi che su Telegram non partiranno mai: chiusi, letti, vecchi, eventi fuori
// dai tre, persone senza chat). Quindi 2 fisse e una query a unità; una sottorichiesta a unità.
// Unità: un messaggio, oppure (2 unità) getUpdates più conferma quando c'è un codice in attesa.
// Se il limite è stretto vince il messaggio: il codice vale 15 minuti e il collegamento aspetta un giro.
export async function giroTelegram(env: Env, now: number, limite: number): Promise<{ collegati: number; inviati: number; sottorichieste: number }> {
  if (!telegramCollegato(env) || limite < 1) return { collegati: 0, inviati: 0, sottorichieste: 0 }; // tutto resta in coda
  const vecchio = now - VECCHIO;
  // La tabella di una riga tiene i codici e il conteggio anche quando non c'è niente da mandare (LEFT JOIN).
  const righe = (await env.DB.prepare(`SELECT c.codici, c.inCoda, n.* FROM (SELECT
        (SELECT json_group_array(json_object('id', id, 'codice', telegram_codice)) FROM users
          WHERE telegram_codice IS NOT NULL AND telegram_codice_at > ?1 AND active = 1) AS codici,
        (SELECT count(*) FROM notifications WHERE telegram_at IS NULL) AS inCoda) c
      LEFT JOIN (SELECT n.id, n.evento, n.titolo, n.testo, n.href, n.created_at AS createdAt,
          u.telegram_chat_id AS chat, u.quiet_hours AS quiet, u.notify_prefs AS prefs
        FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.telegram_at IS NULL AND n.closed_at IS NULL AND n.read_at IS NULL AND n.created_at > ?2
          AND n.evento IN (${IN_EVENTI}) AND u.telegram_chat_id IS NOT NULL AND u.active = 1
        ORDER BY n.created_at LIMIT ?3) n ON 1 = 1
      ORDER BY n.createdAt`).bind(now - VALIDITA_CODICE, vecchio, limite).all<Riga>()).results;
  const attesa = JSON.parse(righe[0]?.codici ?? "[]") as InAttesa[];
  const inCoda = righe[0]?.inCoda ?? 0;
  const pendenti = righe.filter((r) => r.id != null);

  let messaggi = Math.min(pendenti.length, limite);
  const collega = attesa.length > 0 && limite >= 2 && (limite - messaggi >= 2 || limite >= 3);
  if (collega) messaggi = Math.min(messaggi, limite - 2);

  let sottorichieste = 0;
  const scritture: D1PreparedStatement[] = [];
  let collegati = 0;
  if (collega) {
    const l = await leggiCollegamenti(env, attesa);
    sottorichieste += l.sottorichieste;
    collegati = l.scritture.length;
    scritture.push(...l.scritture); // prima dei messaggi e della pulizia: chi si collega ora non perde i suoi avvisi
  }

  let inviati = 0;
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  for (const p of pendenti.slice(0, messaggi)) {
    const salta = inSilenzio(p.quiet, now) || !canaleAcceso(p.prefs, p.evento);
    if (!salta) {
      const testo = [p.titolo, p.testo, p.href && base ? base + p.href : null].filter(Boolean).join("\n");
      sottorichieste++;
      const esito = await invia(env, p.chat, testo);
      if (esito === "ritenta") continue; // resta in coda per il giro dopo
      if (esito === "ok") inviati++;
    }
    scritture.push(env.DB.prepare("UPDATE notifications SET telegram_at = ?1 WHERE id = ?2").bind(now, p.id));
  }
  // Pulizia solo se in coda c'è più di quello che il giro ha letto.
  if (inCoda > pendenti.length) {
    scritture.push(env.DB.prepare(`UPDATE notifications SET telegram_at = ?1 WHERE telegram_at IS NULL AND (closed_at IS NOT NULL
        OR read_at IS NOT NULL OR created_at <= ?2 OR evento NOT IN (${IN_EVENTI})
        OR user_id NOT IN (SELECT id FROM users WHERE telegram_chat_id IS NOT NULL AND active = 1))`).bind(now, vecchio));
  }
  if (scritture.length) await env.DB.batch(scritture);
  return { collegati, inviati, sottorichieste };
}
