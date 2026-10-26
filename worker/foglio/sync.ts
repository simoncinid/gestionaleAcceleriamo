import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { leads, sheetSyncState } from "../db/schema";
import type { Env } from "../env";
import type { Impostazioni } from "../impostazioni/default";
import { leggiImpostazioni } from "../impostazioni/service";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { addActivity, createLead } from "../leads/service";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { aE164 } from "../lib/telefono";
import { catenaLeadNuovo } from "../regole/catena";
import { tokenGoogle } from "./jwt";
import { leggiCsv, leggiIntervalli } from "./leggi";
import { eDemo, NIENTE_IN_DEMO } from "../lib/demo";

// `ancora`: il giro si è fermato prima della fine del foglio (tetto o blocco pieno), un altro giro troverà altre righe.
export type GiroFoglio = { lette: number; create: number; agganciate: number; scartate: number; riletto: boolean; ancora: boolean; errore?: string };
export type RigaAnteprima = { riga: number; azienda: string; referente: string; telefono: string | null; email: string | null; campagna: string; scartata: string | null };

const BLOCCO = 50;            // righe nuove guardate per giro
const MASSIMO_CREATI = 10;    // lead nuovi per giro: ognuno manda un'email, restiamo sotto le 15 sottorichieste
const RILETTURA = 2000;       // righe lette quando il foglio ha cambiato forma
// D1 online lega al massimo 100 parametri per query: candidati() ne usa fino a 5 per riga, quindi blocchi da 16.
const RIGHE_PER_RICERCA = 16;
// Costo in query D1 di ogni passo del ciclo. Il budget del giro è massimoCreati * creato + 2: con il tetto del cron
// (2 lead) fa 36, e il resto del giro ne usa circa 6, sotto le 50 di una invocazione. Prima di ogni riga si tiene
// posto per il caso peggiore, un lead nuovo con la sua catena: così anche gli agganci (2 query l'uno) hanno un tetto.
const SPESA = { ricerca: 1, aggancio: 2, creato: 17 } as const;

type ImpFoglio = Impostazioni["foglio"];
// Intervalli di righe del foglio (numerate da 1, estremi inclusi) → righe di ciascun intervallo.
type Lettore = (intervalli: [number, number][]) => Promise<string[][][]>;

// Con l'email l'impronta resta "data|email" (le righe già lette non cambiano chiave). Senza email entrano telefono e nome:
// prima tutte le righe dello stesso giorno senza email avevano la stessa impronta e dalla seconda non nasceva il lead.
export async function impronta(r: { data: string; email: string; telefono?: string; referente?: string; azienda?: string }) {
  const email = r.email.trim().toLowerCase();
  const testo = email ? `${r.data.trim()}|${email}` : `${r.data.trim()}||${(r.telefono ?? "").trim()}|${(r.referente || r.azienda || "").trim()}`;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const conAccountDiServizio = (env: Env) => Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);

// Due vie, stessa forma: con l'account di servizio si chiedono a Google solo gli intervalli della scheda;
// senza, si scarica il CSV del link (scheda indicata dal gid) una volta per giro e gli intervalli si ritagliano da lì.
async function lettore(env: Env, db: Db, foglio: ImpFoglio, now: number): Promise<Lettore> {
  if (conAccountDiServizio(env)) {
    const token = await tokenGoogle(env, db, now);
    return (intervalli) => leggiIntervalli(token, foglio.spreadsheetId, foglio.scheda, intervalli);
  }
  let tutte: Promise<string[][]> | null = null;
  return async (intervalli) => {
    tutte ??= leggiCsv(foglio.spreadsheetId, foglio.gid || "0");
    const righe = await tutte;
    return intervalli.map(([da, a]) => righe.slice(da - 1, a));
  };
}

type Mappata = { vuota: boolean; prova: boolean; data: string; azienda: string; referente: string; telefono: string; email: string; campagna: string; inserzione: string; metaId: string; risposte: Record<string, string> };

// Colonne della mappa cercate per nome nell'intestazione; quelle non mappate vanno nelle risposte del modulo.
function mappatore(testata: string[], mappa: ImpFoglio["mappa"]) {
  const indice = new Map(testata.map((n, i) => [n.trim(), i]));
  const mancanti = Object.values(mappa).map((n) => n.trim()).filter((nome) => nome && !indice.has(nome));
  if (!mappa.data.trim() || !mappa.email.trim()) mancanti.unshift("Data o Email (servono all'impronta)");
  const usate = new Set(Object.values(mappa).map((n) => n.trim()).filter(Boolean));
  const val = (riga: string[], nome: string) => (nome.trim() ? (riga[indice.get(nome.trim()) ?? -1] ?? "").trim() : "");
  const mappaRiga = (riga: string[]): Mappata => {
    const m = {
      data: val(riga, mappa.data), azienda: val(riga, mappa.azienda), referente: val(riga, mappa.referente), telefono: val(riga, mappa.telefono),
      email: val(riga, mappa.email), campagna: val(riga, mappa.campagna), inserzione: val(riga, mappa.inserzione), metaId: val(riga, mappa.metaId),
    };
    const risposte: Record<string, string> = {};
    testata.forEach((n, i) => { if (n.trim() && !usate.has(n.trim()) && (riga[i] ?? "").trim()) risposte[n.trim()] = riga[i].trim(); });
    const vuota = riga.every((c) => !c?.trim());
    const prova = [m.azienda, m.referente, m.email].some((v) => v.toLowerCase().includes("test lead"));
    return { vuota, prova, risposte, ...m };
  };
  return { mancanti, mappaRiga };
}

async function salvaStato(db: Db, set: Partial<typeof sheetSyncState.$inferInsert>) {
  await db.update(sheetSyncState).set(set).where(eq(sheetSyncState.id, "foglio-andrea"));
}

// Un lead già legato a una riga (anche cestinato) si riconosce dall'impronta: la riga non fa rinascere niente.
// Telefono, email e id Meta cercano solo tra i lead non cestinati.
async function candidati(db: Db, righe: Mappata[], impronte: (string | null)[]) {
  const telefoni = righe.map((r) => normalizePhone(r.telefono)).filter((v): v is string => !!v);
  const email = righe.map((r) => normalizeEmail(r.email)).filter((v): v is string => !!v);
  const meta = righe.map((r) => r.metaId).filter(Boolean);
  const chiavi = impronte.filter((v): v is string => !!v);
  const cond: SQL[] = [];
  if (telefoni.length) cond.push(inArray(leads.phoneNorm, telefoni));
  if (email.length) cond.push(inArray(leads.emailNorm, email));
  if (meta.length) cond.push(inArray(leads.metaLeadId, meta));
  const dove: SQL[] = [];
  if (chiavi.length) dove.push(inArray(leads.sheetRowKey, chiavi));
  if (cond.length) dove.push(and(isNull(leads.deletedAt), or(...cond))!);
  if (!dove.length) return [];
  return db.select({ id: leads.id, phoneNorm: leads.phoneNorm, emailNorm: leads.emailNorm, metaLeadId: leads.metaLeadId, sheetRowKey: leads.sheetRowKey, deletedAt: leads.deletedAt })
    .from(leads).where(or(...dove));
}

// Spec 6.1, Foglio Andrea: senso unico, solo righe nuove, rilettura una volta se il foglio cambia forma.
// Senza id del foglio la lettura non è collegata: nessuna chiamata e nessun errore.
// `massimoCreati`: il cron ne passa meno del default per restare sotto le 50 query D1 di una invocazione.
export async function giroFoglio(env: Env, now: number, massimoCreati = MASSIMO_CREATI): Promise<GiroFoglio | null> {
  if (eDemo(env)) return null;
  const db = getDb(env.DB);
  const { foglio } = await leggiImpostazioni(db);
  if (!foglio.attivo || !foglio.spreadsheetId.trim()) return null;
  const esito: GiroFoglio = { lette: 0, create: 0, agganciate: 0, scartate: 0, riletto: false, ancora: false };
  const fallisci = async (errore: string) => {
    await segnaErrore(db, "foglio", errore, now);
    await salvaStato(db, { lastRunAt: now, lastRun: JSON.stringify({ ...esito, errore }) });
    return { ...esito, errore };
  };
  const st = await db.select().from(sheetSyncState).where(eq(sheetSyncState.id, "foglio-andrea")).get();
  const ultima = st?.lastRow ?? 1;
  try {
    const leggi = await lettore(env, db, foglio, now);
    const [testata, controllo, nuove] = await leggi([[1, 1], [Math.max(ultima, 1), Math.max(ultima, 1)], [ultima + 1, ultima + BLOCCO]]);
    const { mancanti, mappaRiga } = mappatore(testata[0] ?? [], foglio.mappa);
    if (mancanti.length) return fallisci(`Colonna ${mancanti[0]} non trovata`);

    let da = ultima + 1;
    let righe = nuove;
    if (ultima > 1) {
      const r = mappaRiga(controllo[0] ?? []);
      if ((await impronta(r)) !== st?.lastRowHash) {
        esito.riletto = true;
        da = 2;
        [righe] = await leggi([[2, RILETTURA + 1]]);
      }
    }

    const mappate = righe.map(mappaRiga);
    // Impronta solo se c'è almeno data o email: due righe senza nessuna delle due non devono sembrare la stessa.
    // Impronte e candidati si cercano a blocchi, solo quando il ciclo ci arriva.
    const impronte: (string | null)[] = [];
    const esistenti: Awaited<ReturnType<typeof candidati>> = [];
    const budget = massimoCreati * SPESA.creato + 2;
    let spesa = 0;
    let fine = da - 1;
    let ultimaImpronta = st?.lastRowHash ?? null;
    let fermato = false;
    for (const [i, r] of mappate.entries()) {
      const nuovoBlocco = i % RIGHE_PER_RICERCA === 0;
      if (esito.create >= massimoCreati || spesa + (nuovoBlocco ? SPESA.ricerca : 0) + SPESA.creato > budget) { fermato = true; break; }
      if (nuovoBlocco) {
        const blocco = mappate.slice(i, i + RIGHE_PER_RICERCA);
        const chiavi = await Promise.all(blocco.map((b) => (b.data || b.email ? impronta(b) : null)));
        impronte.push(...chiavi);
        const visti = new Set(esistenti.map((l) => l.id));
        esistenti.push(...(await candidati(db, blocco, chiavi)).filter((l) => !visti.has(l.id)));
        spesa += SPESA.ricerca;
      }
      fine = da + i;
      ultimaImpronta = await impronta(r);
      esito.lette++;
      if (r.vuota || r.prova) { esito.scartate++; continue; }
      const chiave = impronte[i];
      if (chiave && esistenti.some((l) => l.sheetRowKey === chiave)) { esito.agganciate++; continue; }
      const tel = normalizePhone(r.telefono);
      const mail = normalizeEmail(r.email);
      const trovato = esistenti.find((l) => l.deletedAt == null && ((r.metaId && l.metaLeadId === r.metaId) || (tel && l.phoneNorm === tel) || (mail && l.emailNorm === mail)));
      if (trovato) {
        esito.agganciate++;
        if (trovato.sheetRowKey == null) {
          await db.update(leads).set({ sheetRowKey: ultimaImpronta, updatedAt: now }).where(eq(leads.id, trovato.id));
          await addActivity(db, trovato.id, "foglio", "Visto anche nel Foglio Andrea", null, now);
          trovato.sheetRowKey = ultimaImpronta;
          spesa += SPESA.aggancio;
        }
        continue;
      }
      const creato = await createLead(db, {
        company: r.azienda || r.referente || "Lead dal Foglio Andrea senza nome",
        contactName: r.referente || null, phone: aE164(r.telefono) ?? (r.telefono || null), email: r.email || null, source: "foglio_andrea",
      }, null, now);
      const campi = {
        sheetRowKey: ultimaImpronta, metaCampaign: r.campagna || null, metaAd: r.inserzione || null,
        metaAnswers: Object.keys(r.risposte).length ? JSON.stringify(r.risposte) : null,
      };
      // Una sola scrittura con metaLeadId (una query in meno per lead nel budget del giro).
      // Corsa col webhook: il vincolo unico su metaLeadId blocca il secondo, che resta come possibile doppione.
      try { await db.update(leads).set(r.metaId ? { ...campi, metaLeadId: r.metaId } : campi).where(eq(leads.id, creato.id)); }
      catch (err) {
        if (!r.metaId) throw err;
        const primo = await db.select({ id: leads.id }).from(leads).where(eq(leads.metaLeadId, r.metaId)).get();
        await db.update(leads).set({ ...campi, duplicateOfId: primo?.id ?? null }).where(eq(leads.id, creato.id));
      }
      esistenti.push({ id: creato.id, phoneNorm: tel, emailNorm: mail, metaLeadId: r.metaId || null, sheetRowKey: ultimaImpronta, deletedAt: null });
      // Come in meta/ingest.ts: se la catena fallisce su un lead, il lead resta e il giro continua con gli altri.
      try {
        await catenaLeadNuovo(env, creato.id, "foglio", now);
      } catch (err) {
        console.error("catena_lead_nuovo_fallita", creato.id, err);
      }
      esito.create++;
      spesa += SPESA.creato;
    }
    esito.ancora = fermato || righe.length >= (esito.riletto ? RILETTURA : BLOCCO);
    await salvaStato(db, { lastRow: Math.max(fine, esito.riletto ? 1 : ultima), lastRowHash: ultimaImpronta, lastRunAt: now, lastRun: JSON.stringify(esito) });
    await segnaOk(db, "foglio", now);
    return esito;
  } catch (e) {
    return fallisci((e as Error).message);
  }
}

// Passo 3 di 18.3: prima di accendere la lettura, si guarda la mappa su dieci righe vere. Non scrive niente.
export async function anteprimaFoglio(env: Env, now: number): Promise<{ colonneMancanti: string[]; righe: RigaAnteprima[] }> {
  if (eDemo(env)) throw new Error(NIENTE_IN_DEMO);
  const db = getDb(env.DB);
  const { foglio } = await leggiImpostazioni(db);
  if (!foglio.spreadsheetId.trim()) throw new Error("Id del foglio mancante");
  const leggi = await lettore(env, db, foglio, now);
  const [testata, righe] = await leggi([[1, 1], [2, 11]]);
  const { mancanti, mappaRiga } = mappatore(testata[0] ?? [], foglio.mappa);
  return {
    colonneMancanti: mancanti,
    righe: righe.map((grezza, i) => {
      const r = mappaRiga(grezza);
      return {
        riga: i + 2, azienda: r.azienda, referente: r.referente, telefono: aE164(r.telefono), email: normalizeEmail(r.email), campagna: r.campagna,
        scartata: r.vuota ? "riga vuota" : r.prova ? "riga di prova" : null,
      };
    }),
  };
}
