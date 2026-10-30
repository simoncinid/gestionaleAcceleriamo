import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { spesoDelMese } from "../claude/coda";
import { centsDaMicros } from "../claude/costo";
import { LAVORI } from "../cron";
import { getDb } from "../db/client";
import { hookLog, integrationStatus, sheetSyncState } from "../db/schema";
import { inviaEmail } from "../email/resend";
import type { AppEnv, Env } from "../env";
import { anteprimaFoglio, giroFoglio } from "../foglio/sync";
import { leggiImpostazioni } from "../impostazioni/service";
import { meseRoma } from "../lib/roma";
import { MAX_META_ATTEMPTS } from "../meta/ingest";
import { pushCollegate } from "../push/invio";
import { provaPush } from "../push/routes";
import { hookSchema } from "../proposte/schema";
import { mandaTelegram, nuovoCodice, telegramCollegato } from "../telegram/bot";
import { segnaErrore, segnaOk } from "./stato";

// "spento" vale anche per "non collegato": un segreto o un link che manca non è mai un errore rosso.
// extra: numeri che la schermata formatta da sé (Claude: speso del mese e tetto, in centesimi).
export type Integrazione = { key: string; etichetta: string; stato: "ok" | "errore" | "spento" | "mai"; ultimaOk: number | null; nota: string | null; extra?: { spesoCents: number; tettoCents: number } };
export type StatoSistema = {
  integrazioni: Integrazione[];
  settimana: { meta: number; foglio: number; aggancio: number };
  errori: { key: string; etichetta: string; errore: string; errorId: string | null; at: number }[];
  segreti: { meta: boolean; resend: boolean; google: boolean; aggancio: boolean };
  foglio: { ultimaRiga: number; ultimaLettura: number | null };
};
export type VoceRegistro = { id: string; at: number; status: number; number: string | null; outcome: string | null };

const ETICHETTE: Record<string, string> = {
  meta: "Meta", foglio: "Foglio Andrea", aggancio: "Aggancio proposte", posta: "Posta di Tommaso", resend: "Resend",
  push: "Push", telegram: "Telegram", claude: "Assistente", giro: "Giro programmato",
};
const SETTIMANA = 7 * 86_400_000;
export const SENZA_CHIAVE_RESEND = "Non collegato: manca la chiave di Resend";
export const SENZA_CHIAVE_AGGANCIO = "Non collegato: manca la chiave dell'aggancio";
const SENZA_SEGRETI_META = "Non collegato: mancano i segreti di Meta";
// Il lettore della casella gira fuori dal Worker (scripts/posta): qui si vede solo se la chiave c'è e l'ultima mail arrivata.
const SENZA_CHIAVE_POSTA = "Non collegato: manca la chiave della posta";
const SENZA_LINK_FOGLIO = "Non collegato: manca il link del foglio";
export const SENZA_CHIAVI_PUSH = "Non collegato: mancano le chiavi VAPID";
export const SENZA_BOT_TELEGRAM = "Non collegato: manca il token del bot";
export const SENZA_CHIAVE_CLAUDE = "Non collegato: manca la chiave di Anthropic";
const SENZA_NOME_BOT = "Non collegato: manca il nome del bot";

// I segreti risultano solo presenti o mancanti: il valore non esce mai dal Worker.
const segretiDi = (env: Env) => ({
  meta: Boolean(env.META_PAGE_TOKEN && env.META_APP_SECRET && env.META_VERIFY_TOKEN),
  resend: Boolean(env.RESEND_API_KEY),
  google: Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY),
  aggancio: Boolean(env.PROPOSAL_HOOK_KEY),
});

export const integrazioniRoutes = new Hono<AppEnv>();

// Spec 11.1: semafori, numeri della settimana, ultimi errori.
integrazioniRoutes.get("/status", async (c) => {
  const db = getDb(c.env.DB);
  const da = Date.now() - SETTIMANA;
  const conta = async (q: string, ...b: unknown[]) => (await c.env.DB.prepare(q).bind(...b).first<{ n: number }>())?.n ?? 0;
  const [righe, imp, st, ultimoMetaRiga, metaFermi, sMeta, sFoglio, sAggancio, dispositivi, chat, spesoClaude] = await Promise.all([
    db.select().from(integrationStatus),
    leggiImpostazioni(db),
    db.select().from(sheetSyncState).where(eq(sheetSyncState.id, "foglio-andrea")).get(),
    c.env.DB.prepare("SELECT max(created_at) t FROM leads WHERE source = 'meta' AND meta_status = 'ok' AND deleted_at IS NULL").first<{ t: number | null }>(),
    conta("SELECT count(*) n FROM leads WHERE meta_status = 'error' AND meta_attempts >= ? AND deleted_at IS NULL", MAX_META_ATTEMPTS),
    conta("SELECT count(*) n FROM leads WHERE source = 'meta' AND created_at >= ?", da),
    conta("SELECT count(*) n FROM leads WHERE source = 'foglio_andrea' AND created_at >= ?", da),
    conta("SELECT count(*) n FROM hook_log WHERE status IN (200, 201) AND outcome <> 'prova' AND at >= ?", da),
    pushCollegate(c.env) ? conta("SELECT count(*) n FROM push_subscriptions WHERE rotta = 0") : Promise.resolve(0),
    telegramCollegato(c.env) ? conta("SELECT count(*) n FROM users WHERE telegram_chat_id IS NOT NULL AND active = 1") : Promise.resolve(0),
    c.env.ANTHROPIC_API_KEY ? spesoDelMese(c.env.DB, meseRoma(Date.now())) : Promise.resolve(0),
  ]);
  const segreti = segretiDi(c.env);
  const collegato = (key: string) => (key === "resend" ? segreti.resend : key === "aggancio" ? segreti.aggancio : key === "telegram" ? telegramCollegato(c.env) : key === "claude" ? Boolean(c.env.ANTHROPIC_API_KEY) : true);
  const daRiga = (key: string, spento: string | null): Integrazione => {
    const r = righe.find((x) => x.key === key);
    const base = { key, etichetta: ETICHETTE[key], ultimaOk: r?.lastOkAt ?? null };
    if (spento) return { ...base, stato: "spento", nota: spento };
    if (!r) return { ...base, stato: "mai", nota: "Non ha ancora lavorato" };
    return { ...base, stato: r.ok ? "ok" : "errore", nota: r.ok ? null : r.lastError };
  };
  // Meta non scrive in integration_status: l'ultima volta è l'ultimo lead completo, l'errore sono i lead fermi dopo tutti i tentativi.
  const ultimoMeta = ultimoMetaRiga?.t ?? null;
  const meta: Integrazione = !segreti.meta
    ? { key: "meta", etichetta: "Meta", stato: "spento", ultimaOk: null, nota: SENZA_SEGRETI_META }
    : metaFermi > 0
      ? { key: "meta", etichetta: "Meta", stato: "errore", ultimaOk: ultimoMeta, nota: metaFermi === 1 ? "1 lead Meta incompleto" : `${metaFermi} lead Meta incompleti` }
      : { key: "meta", etichetta: "Meta", stato: ultimoMeta ? "ok" : "mai", ultimaOk: ultimoMeta, nota: ultimoMeta ? null : "Nessun lead ricevuto" };
  // Push: senza chiavi VAPID "Non collegato"; con le chiavi il numero dei dispositivi attivi.
  const push: Integrazione = pushCollegate(c.env)
    ? { key: "push", etichetta: "Push", stato: "ok", ultimaOk: null, nota: dispositivi === 1 ? "1 dispositivo" : `${dispositivi} dispositivi` }
    : { key: "push", etichetta: "Push", stato: "spento", ultimaOk: null, nota: SENZA_CHIAVI_PUSH };
  // Telegram: senza token del bot "Non collegato"; token rifiutato dal giro: rosso con l'errore;
  // altrimenti il numero delle chat collegate.
  const rigaTelegram = righe.find((x) => x.key === "telegram");
  const telegram: Integrazione = !telegramCollegato(c.env)
    ? { key: "telegram", etichetta: "Telegram", stato: "spento", ultimaOk: null, nota: c.env.TELEGRAM_BOT_TOKEN ? SENZA_NOME_BOT : SENZA_BOT_TELEGRAM }
    : rigaTelegram && !rigaTelegram.ok
      ? { key: "telegram", etichetta: "Telegram", stato: "errore", ultimaOk: rigaTelegram.lastOkAt ?? null, nota: rigaTelegram.lastError }
      : { key: "telegram", etichetta: "Telegram", stato: "ok", ultimaOk: rigaTelegram?.lastOkAt ?? null, nota: chat === 1 ? "1 chat collegata" : `${chat} chat collegate` };
  // Claude: senza chiave "Non collegato"; con la chiave lo stato dei lavori (integration_status) e lo speso del mese.
  const claude: Integrazione = c.env.ANTHROPIC_API_KEY
    ? { ...daRiga("claude", null), extra: { spesoCents: centsDaMicros(spesoClaude), tettoCents: imp.claude.tettoCents } }
    : { key: "claude", etichetta: "Assistente", stato: "spento", ultimaOk: null, nota: SENZA_CHIAVE_CLAUDE };
  const foglioSpento = !imp.foglio.spreadsheetId.trim() ? SENZA_LINK_FOGLIO : !imp.foglio.attivo ? "Lettura spenta" : null;
  const out: StatoSistema = {
    integrazioni: [
      meta,
      daRiga("foglio", foglioSpento),
      daRiga("aggancio", segreti.aggancio ? null : SENZA_CHIAVE_AGGANCIO),
      daRiga("posta", c.env.MAIL_HOOK_KEY ? null : SENZA_CHIAVE_POSTA),
      daRiga("resend", segreti.resend ? null : SENZA_CHIAVE_RESEND),
      push, telegram, claude,
      daRiga("giro", null),
    ],
    settimana: { meta: sMeta, foglio: sFoglio, aggancio: sAggancio },
    // Gli errori di un'integrazione non collegata non si mostrano: senza chiave non c'è niente da sistemare se non la chiave.
    errori: righe
      .filter((r) => r.lastErrorAt != null && r.lastError && collegato(r.key))
      .sort((a, b) => b.lastErrorAt! - a.lastErrorAt!)
      .slice(0, 5)
      .map((r) => ({ key: r.key, etichetta: ETICHETTE[r.key] ?? r.key, errore: r.lastError!, errorId: r.errorId, at: r.lastErrorAt! })),
    segreti,
    foglio: { ultimaRiga: st?.lastRow ?? 1, ultimaLettura: st?.lastRunAt ?? null },
  };
  // Spazio demo (spec 12): nessun segreto e nessun servizio vero, lo si dice in chiaro.
  if (c.env.SPAZIO === "demo") out.integrazioni = out.integrazioni.map((i) => ({ ...i, stato: "spento", ultimaOk: null, nota: "Spazio demo", extra: undefined }));
  if (c.env.SPAZIO === "demo") out.errori = [];
  return c.json(out);
});

// Stesso tetto del cron: anche una richiesta HTTP ha 50 query D1 sul piano gratuito.
// Nello spazio demo il foglio non si legge mai: nessun dato vero entra nei dati finti.
const SOLO_FUORI_DEMO = "Nello spazio demo il foglio non si legge";
integrazioniRoutes.post("/foglio/leggi", async (c) => {
  if (c.env.SPAZIO === "demo") return c.json({ error: SOLO_FUORI_DEMO }, 409);
  const esito = await giroFoglio(c.env, Date.now(), LAVORI.foglio?.max ?? 2);
  if (!esito) return c.json({ error: "La lettura del foglio è spenta: incolla il link, accendila e salva" }, 409);
  return c.json({ giro: esito });
});

integrazioniRoutes.get("/foglio/anteprima", async (c) => {
  if (c.env.SPAZIO === "demo") return c.json({ error: SOLO_FUORI_DEMO }, 409);
  const { foglio } = await leggiImpostazioni(getDb(c.env.DB));
  if (!foglio.spreadsheetId.trim()) return c.json({ error: "Incolla prima il link del foglio e salva" }, 409);
  try {
    return c.json(await anteprimaFoglio(c.env, Date.now()));
  } catch (e) {
    return c.json({ error: `Lettura non riuscita: ${(e as Error).message}` }, 502);
  }
});

integrazioniRoutes.get("/aggancio/registro", async (c) => {
  const voci: VoceRegistro[] = await getDb(c.env.DB).select().from(hookLog).orderBy(desc(hookLog.at)).limit(20);
  return c.json({ voci });
});

// La prova controlla che il corpo d'esempio passi lo schema dell'aggancio e lo scrive nel registro. Non tocca lead né proposte.
const ESEMPIO = { numero: "PROVA-0000", azienda: "Officina di prova", opzione: "standard", setup: 2000, canone: 150, stato: "draft", sourcePath: "prova" };

integrazioniRoutes.post("/aggancio/prova", async (c) => {
  if (!c.env.PROPOSAL_HOOK_KEY) return c.json({ error: `${SENZA_CHIAVE_AGGANCIO}. La mette chi gestisce il server.` }, 409);
  hookSchema.parse(ESEMPIO);
  await getDb(c.env.DB).insert(hookLog).values({ id: crypto.randomUUID(), at: Date.now(), status: 200, number: ESEMPIO.numero, outcome: "prova" });
  return c.json({ ok: true });
});

integrazioniRoutes.post("/resend/prova", async (c) => {
  if (!c.env.RESEND_API_KEY) return c.json({ error: `${SENZA_CHIAVE_RESEND}. La mette chi gestisce il server.` }, 409);
  const db = getDb(c.env.DB);
  const now = Date.now();
  const { conferma } = await leggiImpostazioni(db);
  const r = await inviaEmail(c.env, {
    from: conferma.mittente,
    to: conferma.rispondiA,
    subject: "Prova da Acceleriamo OS",
    text: "Questa è un'email di prova mandata da Impostazioni, Integrazioni. Se la leggi, Resend funziona.",
  });
  if (!r.ok) {
    await segnaErrore(db, "resend", r.errore, now);
    return c.json({ error: r.errore }, 502);
  }
  await segnaOk(db, "resend", now);
  return c.json({ ok: true, a: conferma.rispondiA });
});

integrazioniRoutes.post("/push/prova", async (c) => {
  const r = await provaPush({ env: c.env, userId: c.get("user").id });
  return c.json(r.corpo, r.stato);
});

// Spec 8.4: il link apre il bot con il codice; il giro legge /start e salva la chat. Il codice vale 15 minuti.
integrazioniRoutes.post("/telegram/collega", async (c) => {
  if (!telegramCollegato(c.env)) return c.json({ error: `${SENZA_BOT_TELEGRAM}.` }, 409);
  const codice = await nuovoCodice(c.env.DB, c.get("user").id, Date.now());
  return c.json({ link: `https://t.me/${c.env.TELEGRAM_BOT}?start=${codice}` });
});

integrazioniRoutes.post("/telegram/prova", async (c) => {
  if (!telegramCollegato(c.env)) return c.json({ error: `${SENZA_BOT_TELEGRAM}.` }, 409);
  const u = await c.env.DB.prepare("SELECT telegram_chat_id AS chat FROM users WHERE id = ?1").bind(c.get("user").id).first<{ chat: string | null }>();
  if (!u?.chat) return c.json({ error: "Collega prima Telegram dal tuo profilo." }, 409);
  const ok = await mandaTelegram(c.env, u.chat, "Messaggio di prova da Acceleriamo OS.");
  return ok ? c.json({ ok: true }) : c.json({ error: "Telegram non ha accettato il messaggio." }, 502);
});

// Scollega la mia chat (e un codice ancora in attesa): le altre persone restano collegate.
integrazioniRoutes.delete("/telegram", async (c) => {
  await c.env.DB.prepare("UPDATE users SET telegram_chat_id = NULL, telegram_codice = NULL, telegram_codice_at = NULL WHERE id = ?1").bind(c.get("user").id).run();
  return c.json({ ok: true });
});
