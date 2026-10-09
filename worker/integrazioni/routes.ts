import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { LIMITI } from "../cron";
import { getDb } from "../db/client";
import { hookLog, integrationStatus, sheetSyncState } from "../db/schema";
import { inviaEmail } from "../email/resend";
import type { AppEnv, Env } from "../env";
import { anteprimaFoglio, giroFoglio } from "../foglio/sync";
import { leggiImpostazioni } from "../impostazioni/service";
import { MAX_META_ATTEMPTS } from "../meta/ingest";
import { hookSchema } from "../proposte/schema";
import { segnaErrore, segnaOk } from "./stato";

// "spento" vale anche per "non collegato": un segreto o un link che manca non è mai un errore rosso.
export type Integrazione = { key: string; etichetta: string; stato: "ok" | "errore" | "spento" | "mai"; ultimaOk: number | null; nota: string | null };
export type StatoSistema = {
  integrazioni: Integrazione[];
  settimana: { meta: number; foglio: number; aggancio: number };
  errori: { key: string; etichetta: string; errore: string; errorId: string | null; at: number }[];
  segreti: { meta: boolean; resend: boolean; google: boolean; aggancio: boolean };
  foglio: { ultimaRiga: number; ultimaLettura: number | null };
};
export type VoceRegistro = { id: string; at: number; status: number; number: string | null; outcome: string | null };

const ETICHETTE: Record<string, string> = {
  meta: "Meta", foglio: "Foglio Andrea", aggancio: "Aggancio proposte", resend: "Resend",
  push: "Push", telegram: "Telegram", claude: "Claude", giro: "Giro programmato",
};
const SETTIMANA = 7 * 86_400_000;
export const SENZA_CHIAVE_RESEND = "Non collegato: manca la chiave di Resend";
export const SENZA_CHIAVE_AGGANCIO = "Non collegato: manca la chiave dell'aggancio";
const SENZA_SEGRETI_META = "Non collegato: mancano i segreti di Meta";
const SENZA_LINK_FOGLIO = "Non collegato: manca il link del foglio";

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
  const [righe, imp, st, ultimoMetaRiga, metaFermi, sMeta, sFoglio, sAggancio] = await Promise.all([
    db.select().from(integrationStatus),
    leggiImpostazioni(db),
    db.select().from(sheetSyncState).where(eq(sheetSyncState.id, "foglio-andrea")).get(),
    c.env.DB.prepare("SELECT max(created_at) t FROM leads WHERE source = 'meta' AND meta_status = 'ok' AND deleted_at IS NULL").first<{ t: number | null }>(),
    conta("SELECT count(*) n FROM leads WHERE meta_status = 'error' AND meta_attempts >= ? AND deleted_at IS NULL", MAX_META_ATTEMPTS),
    conta("SELECT count(*) n FROM leads WHERE source = 'meta' AND created_at >= ?", da),
    conta("SELECT count(*) n FROM leads WHERE source = 'foglio_andrea' AND created_at >= ?", da),
    conta("SELECT count(*) n FROM hook_log WHERE status IN (200, 201) AND outcome <> 'prova' AND at >= ?", da),
  ]);
  const segreti = segretiDi(c.env);
  const collegato = (key: string) => (key === "resend" ? segreti.resend : key === "aggancio" ? segreti.aggancio : true);
  const daRiga = (key: string, spento: string | null): Integrazione => {
    const r = righe.find((x) => x.key === key);
    const base = { key, etichetta: ETICHETTE[key], ultimaOk: r?.lastOkAt ?? null };
    if (spento) return { ...base, stato: "spento", nota: spento };
    if (!r) return { ...base, stato: "mai", nota: "Non ha ancora lavorato" };
    return { ...base, stato: r.ok ? "ok" : "errore", nota: r.ok ? null : r.lastError };
  };
  const futura = (key: string): Integrazione => ({ key, etichetta: ETICHETTE[key], stato: "spento", ultimaOk: null, nota: "Non ancora attivo" });
  // Meta non scrive in integration_status: l'ultima volta è l'ultimo lead completo, l'errore sono i lead fermi dopo tutti i tentativi.
  const ultimoMeta = ultimoMetaRiga?.t ?? null;
  const meta: Integrazione = !segreti.meta
    ? { key: "meta", etichetta: "Meta", stato: "spento", ultimaOk: null, nota: SENZA_SEGRETI_META }
    : metaFermi > 0
      ? { key: "meta", etichetta: "Meta", stato: "errore", ultimaOk: ultimoMeta, nota: metaFermi === 1 ? "1 lead Meta incompleto" : `${metaFermi} lead Meta incompleti` }
      : { key: "meta", etichetta: "Meta", stato: ultimoMeta ? "ok" : "mai", ultimaOk: ultimoMeta, nota: ultimoMeta ? null : "Nessun lead ricevuto" };
  const foglioSpento = !imp.foglio.spreadsheetId.trim() ? SENZA_LINK_FOGLIO : !imp.foglio.attivo ? "Lettura spenta" : null;
  const out: StatoSistema = {
    integrazioni: [
      meta,
      daRiga("foglio", foglioSpento),
      daRiga("aggancio", segreti.aggancio ? null : SENZA_CHIAVE_AGGANCIO),
      daRiga("resend", segreti.resend ? null : SENZA_CHIAVE_RESEND),
      futura("push"), futura("telegram"), futura("claude"),
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
  return c.json(out);
});

// Stesso tetto del cron: anche una richiesta HTTP ha 50 query D1 sul piano gratuito.
integrazioniRoutes.post("/foglio/leggi", async (c) => {
  const esito = await giroFoglio(c.env, Date.now(), LIMITI.foglio);
  if (!esito) return c.json({ error: "La lettura del foglio è spenta: incolla il link, accendila e salva" }, 409);
  return c.json({ giro: esito });
});

integrazioniRoutes.get("/foglio/anteprima", async (c) => {
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
  if (!c.env.PROPOSAL_HOOK_KEY) return c.json({ error: `${SENZA_CHIAVE_AGGANCIO}: si mette con wrangler secret put PROPOSAL_HOOK_KEY` }, 409);
  hookSchema.parse(ESEMPIO);
  await getDb(c.env.DB).insert(hookLog).values({ id: crypto.randomUUID(), at: Date.now(), status: 200, number: ESEMPIO.numero, outcome: "prova" });
  return c.json({ ok: true });
});

integrazioniRoutes.post("/resend/prova", async (c) => {
  if (!c.env.RESEND_API_KEY) return c.json({ error: `${SENZA_CHIAVE_RESEND}: si mette con wrangler secret put RESEND_API_KEY` }, 409);
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
