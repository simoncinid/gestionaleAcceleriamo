import { EVENTI } from "../avvisi/eventi";
import { canaleAcceso, inSilenzio } from "../avvisi/silenzio";
import type { EventoAvviso } from "../db/schema";
import type { Env } from "../env";
import { telegramFetch } from "./fetcher";
import { eDemo } from "../lib/demo";

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
// "token" token sbagliato o revocato (401, 404 per formato errato): gli avvisi restano in coda e lo stato diventa rosso;
// "bloccato" la persona ha bloccato il bot (403): la sua chat si scollega;
// "rifiutato" altri 4xx (chat sparita, testo rifiutato): riprovare non serve, l'avviso si segna.
type Esito = "ok" | "ritenta" | "token" | "bloccato" | "rifiutato";
export const TOKEN_NON_VALIDO = "Token del bot non valido";

async function invia(env: Env, chatId: string, testo: string): Promise<Esito> {
  if (eDemo(env)) return "rifiutato";
  try {
    // Testo semplice, senza parse_mode: il nome di un'azienda non può diventare formattazione.
    const r = await telegramFetch(api(env, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: testo, disable_web_page_preview: true }),
    });
    if (r.ok) return "ok";
    if (r.status === 401 || r.status === 404) return "token";
    if (r.status === 403) return "bloccato";
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

// Risposta a un /start con un codice che non corrisponde (sbagliato, scaduto o già usato).
export const CODICE_NON_RICONOSCIUTO = "Codice non riconosciuto. Rifai il collegamento dal tuo profilo nell'app.";
// Risposte a codici sbagliati in un giro: una basta (chi sbaglia è davanti al telefono); le altre si confermano in silenzio.
const RISPOSTE_PER_GIRO = 1;

type Letti = { scritture: D1PreparedStatement[]; daRispondere: string[]; conferma: number | null; sottorichieste: number };

// Una sottorichiesta: la lettura. Restituisce le scritture dei collegamenti (al massimo 2), le chat a cui
// rispondere "Codice non riconosciuto" e l'offset da confermare: la conferma la manda il giro dopo la sua batch,
// così un collegamento che non si scrive torna da Telegram al giro dopo invece di andare perso.
// Una lettura che non riesce non rompe niente: il codice resta valido e si riprova al giro dopo.
export async function leggiCollegamenti(env: Env, attesa: InAttesa[], giaCollegate: string[] = []): Promise<Letti> {
  const nulla: Letti = { scritture: [], daRispondere: [], conferma: null, sottorichieste: 0 };
  if (eDemo(env)) return nulla;
  let j: { ok: boolean; result: Aggiornamento[] };
  try {
    const r = await telegramFetch(api(env, "getUpdates") + "?timeout=0&allowed_updates=%5B%22message%22%5D");
    j = (await r.json()) as typeof j;
  } catch {
    return { ...nulla, sottorichieste: 1 };
  }
  if (!j?.ok || !Array.isArray(j.result) || !j.result.length) return { ...nulla, sottorichieste: 1 };
  const scritture: D1PreparedStatement[] = [];
  const daRispondere: string[] = [];
  const usati = new Set<string>();
  const collegateNelGiro = new Set<string>();
  let conferma = 0;
  for (const u of [...j.result].sort((a, b) => a.update_id - b.update_id)) {
    const m = /^\/start\s+(\S+)/.exec(u.message?.text ?? "");
    const chi = m && attesa.find((a) => a.codice === m[1] && !usati.has(a.id));
    if (chi && u.message) {
      // Oltre i collegamenti del giro: l'aggiornamento resta a Telegram e torna al giro dopo.
      if (scritture.length >= COLLEGAMENTI_PER_GIRO) break;
      usati.add(chi.id);
      collegateNelGiro.add(String(u.message.chat.id));
      scritture.push(env.DB.prepare("UPDATE users SET telegram_chat_id = ?1, telegram_codice = NULL, telegram_codice_at = NULL WHERE id = ?2")
        .bind(String(u.message.chat.id), chi.id));
    } else if (m && u.message) {
      // Una chat già collegata che ripete /start (per esempio dopo una conferma persa) non riceve l'errore.
      const chat = String(u.message.chat.id);
      if (!giaCollegate.includes(chat) && !daRispondere.includes(chat)) daRispondere.push(chat);
    }
    conferma = u.update_id + 1;
  }
  // Una chat collegata in questo giro non riceve "Codice non riconosciuto", né per un codice sbagliato prima
  // né per un /start ripetuto dopo (review del Task 14a, minore c).
  return { scritture, daRispondere: daRispondere.filter((c) => !collegateNelGiro.has(c)), conferma, sottorichieste: 1 };
}

type Riga = {
  codici: string;
  chats: string;
  statoOk: number | null;
  userId: string;
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
// Lo stato in Integrazioni (rosso con un token non valido, verde al primo invio riuscito) usa un'unità del limite:
// il rosso prende il posto della scrittura dell'avviso non mandato, il verde si scrive solo se avanza un'unità.
// Unità: un messaggio, oppure (2 unità) getUpdates più conferma quando c'è un codice in attesa, più una per
// la risposta "Codice non riconosciuto". Con un codice in attesa vince il collegamento (limite di almeno 2).
// Arretrato: chi si collega riceve nel giro dopo gli avvisi dei tre eventi non letti e non chiusi delle ultime
// 6 ore (al massimo 5 a giro). Voluto: sono avvisi ancora aperti, e nell'app restano comunque.
export async function giroTelegram(env: Env, now: number, limite: number): Promise<{ collegati: number; inviati: number; sottorichieste: number }> {
  if (!telegramCollegato(env) || limite < 1) return { collegati: 0, inviati: 0, sottorichieste: 0 }; // tutto resta in coda
  const vecchio = now - VECCHIO;
  // La tabella di una riga tiene i codici e il conteggio anche quando non c'è niente da mandare (LEFT JOIN).
  const righe = (await env.DB.prepare(`SELECT c.codici, c.chats, c.inCoda, c.statoOk, n.* FROM (SELECT
        (SELECT json_group_array(json_object('id', id, 'codice', telegram_codice)) FROM users
          WHERE telegram_codice IS NOT NULL AND telegram_codice_at > ?1 AND active = 1) AS codici,
        (SELECT json_group_array(telegram_chat_id) FROM users WHERE telegram_chat_id IS NOT NULL) AS chats,
        (SELECT count(*) FROM notifications WHERE telegram_at IS NULL) AS inCoda,
        (SELECT ok FROM integration_status WHERE key = 'telegram') AS statoOk) c
      LEFT JOIN (SELECT n.id, n.user_id AS userId, n.evento, n.titolo, n.testo, n.href, n.created_at AS createdAt,
          u.telegram_chat_id AS chat, u.quiet_hours AS quiet, u.notify_prefs AS prefs
        FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.telegram_at IS NULL AND n.closed_at IS NULL AND n.read_at IS NULL AND n.created_at > ?2
          AND n.evento IN (${IN_EVENTI}) AND u.telegram_chat_id IS NOT NULL AND u.active = 1
        ORDER BY n.created_at LIMIT ?3) n ON 1 = 1
      ORDER BY n.createdAt`).bind(now - VALIDITA_CODICE, vecchio, limite).all<Riga>()).results;
  const attesa = JSON.parse(righe[0]?.codici ?? "[]") as InAttesa[];
  const inCoda = righe[0]?.inCoda ?? 0;
  const pendenti = righe.filter((r) => r.id != null);

  // Con un codice in attesa e almeno 2 unità vince il collegamento: il codice vale 15 minuti, un avviso 6 ore.
  // Con un limite di 1 vince il messaggio (getUpdates e conferma non ci stanno).
  const collega = attesa.length > 0 && limite >= 2;
  let messaggi = Math.min(pendenti.length, collega ? limite - 2 : limite);

  let sottorichieste = 0;
  const scritture: D1PreparedStatement[] = [];
  let collegati = 0;
  let conferma: number | null = null;
  let riservate = 0; // unità del collegamento: getUpdates, conferma, risposte
  if (collega) {
    riservate = 2;
    const l = await leggiCollegamenti(env, attesa, JSON.parse(righe[0]?.chats ?? "[]") as string[]);
    sottorichieste += l.sottorichieste;
    collegati = l.scritture.length;
    conferma = l.conferma;
    if (conferma != null) sottorichieste++; // la conferma, mandata dopo la batch
    scritture.push(...l.scritture); // prima dei messaggi e della pulizia: chi si collega ora non perde i suoi avvisi
    // La risposta a un codice sbagliato passa prima degli avvisi (chi la aspetta è davanti al telefono)
    // e prende un'unità del limite; senza unità libere il codice sbagliato si conferma in silenzio.
    for (const chat of l.daRispondere.slice(0, Math.min(RISPOSTE_PER_GIRO, limite - 2))) {
      riservate++;
      sottorichieste++;
      await invia(env, chat, CODICE_NON_RICONOSCIUTO);
    }
    messaggi = Math.min(messaggi, limite - riservate);
  }

  let inviati = 0;
  let trattati = 0;
  let tokenRotto = false;
  const bloccati = new Set<string>();
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  for (const p of pendenti.slice(0, messaggi)) {
    trattati++;
    const salta = bloccati.has(p.userId) || inSilenzio(p.quiet, now) || !canaleAcceso(p.prefs, p.evento);
    if (!salta) {
      const testo = [p.titolo, p.testo, p.href && base ? base + p.href : null].filter(Boolean).join("\n");
      sottorichieste++;
      const esito = await invia(env, p.chat, testo);
      if (esito === "ritenta") continue; // resta in coda per il giro dopo
      if (esito === "token") {
        // Con il token rotto non parte niente: tutto resta in coda (fino a 6 ore) e lo stato diventa rosso.
        tokenRotto = true;
        break;
      }
      if (esito === "bloccato") {
        // Bot bloccato: la chat si scollega, così i prossimi avvisi non sprecano sottorichieste.
        bloccati.add(p.userId);
        scritture.push(env.DB.prepare("UPDATE users SET telegram_chat_id = NULL WHERE id = ?1 AND telegram_chat_id = ?2").bind(p.userId, p.chat));
      }
      if (esito === "ok") inviati++;
    }
    scritture.push(env.DB.prepare("UPDATE notifications SET telegram_at = ?1 WHERE id = ?2").bind(now, p.id));
  }
  if (tokenRotto) {
    scritture.push(env.DB.prepare(`INSERT INTO integration_status (key, ok, last_error_at, last_error, error_id) VALUES ('telegram', 0, ?1, ?2, ?3)
      ON CONFLICT (key) DO UPDATE SET ok = 0, last_error_at = excluded.last_error_at, last_error = excluded.last_error, error_id = excluded.error_id`)
      .bind(now, TOKEN_NON_VALIDO, crypto.randomUUID().replace(/-/g, "").slice(0, 8)));
  } else if (inviati > 0 && righe[0]?.statoOk !== 1 && riservate + trattati < limite) {
    // Primo invio riuscito (o dopo un errore): lo stato torna verde. Negli altri giri nessuna scrittura;
    // senza un'unità libera il verde aspetta un giro con più spazio.
    scritture.push(env.DB.prepare(`INSERT INTO integration_status (key, ok, last_ok_at) VALUES ('telegram', 1, ?1)
      ON CONFLICT (key) DO UPDATE SET ok = 1, last_ok_at = excluded.last_ok_at`).bind(now));
  }
  // Pulizia solo se in coda c'è più di quello che il giro ha letto.
  if (inCoda > pendenti.length) {
    scritture.push(env.DB.prepare(`UPDATE notifications SET telegram_at = ?1 WHERE telegram_at IS NULL AND (closed_at IS NOT NULL
        OR read_at IS NOT NULL OR created_at <= ?2 OR evento NOT IN (${IN_EVENTI})
        OR user_id NOT IN (SELECT id FROM users WHERE telegram_chat_id IS NOT NULL AND active = 1))`).bind(now, vecchio));
  }
  if (scritture.length) await env.DB.batch(scritture);
  if (conferma != null) {
    try {
      // offset = primo non trattato, così Telegram non ripete i letti.
      await telegramFetch(api(env, "getUpdates") + `?timeout=0&offset=${conferma}`);
    } catch {
      // Conferma persa: gli stessi aggiornamenti tornano al giro dopo; il codice ormai cancellato non collega
      // due volte e la chat già collegata non riceve "Codice non riconosciuto".
    }
  }
  return { collegati, inviati, sottorichieste };
}
