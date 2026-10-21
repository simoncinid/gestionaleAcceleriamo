import { inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { leads, settings } from "../db/schema";
import type { Env } from "../env";
import { eDemo } from "../lib/demo";
import { metaFetch } from "./fetcher";
import { registerMetaLead } from "./ingest";

// Recupero dei lead Meta (spec 22/10/2026): senza iscrizione della Pagina al webhook è la via principale.
// Ogni 15 minuti legge i lead dei moduli della Pagina creati dopo l'ultimo controllo (meno un margine) e registra
// quelli che mancano, con lo stesso registro anti doppioni del webhook (meta_lead_id unico). I dati li completa
// il lavoro "meta" del giro, come per il webhook. Il primo giro parte da 90 giorni fa e va avanti a pagine.
// Tutte le letture dei moduli stanno in una richiesta batch della Graph API: una sola sottorichiesta per giro,
// più una ogni 6 ore per rileggere l'elenco dei moduli.

export const CHIAVE_RECUPERO = "meta_recupero";
const GIORNI_PRIMO_GIRO = 90;
const MARGINE_S = 3600; // un'ora: un lead scritto da Meta in ritardo rientra nel giro dopo
const MODULI_OGNI_MS = 6 * 3_600_000;
const ID_PER_QUERY = 90; // il controllo dei doppioni è una query sola: sotto il tetto di 100 parametri di D1
const MAX_MODULI = 50; // tetto della batch della Graph API

// da: secondi Unix del filtro; ciclo: giro a pagine in corso (primo import o arretrato), con il cursore per modulo
// (null = modulo finito in questo ciclo).
export type StatoRecupero = {
  da: number;
  moduli: string[];
  moduliAt: number;
  ciclo: { inizio: number; cursori: Record<string, string | null> } | null;
};

type LeadGraph = { id: string; created_time?: string; form_id?: string; field_data?: { name: string; values?: string[] }[] };
type PaginaGraph = { data?: LeadGraph[]; paging?: { cursors?: { after?: string }; next?: string } };

// Lead di prova dello strumento di Meta: i valori dicono "test lead" (stesso criterio del foglio di Andrea).
export const eLeadDiProva = (l: LeadGraph) => (l.field_data ?? []).some((f) => (f.values ?? []).some((v) => v.toLowerCase().includes("test lead")));

const base = (env: Env) => `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

// Il messaggio di errore di Meta senza il token: mai l'indirizzo completo nei registri.
async function erroreGraph(res: Response, dove: string): Promise<Error> {
  const corpo = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new Error(`${dove}: Graph API ${res.status}${corpo?.error?.message ? `, ${corpo.error.message}` : ""}`);
}

async function leggiModuli(env: Env): Promise<string[]> {
  const url = `${base(env)}/${encodeURIComponent(env.META_PAGE_ID!)}/leadgen_forms?fields=id&limit=${MAX_MODULI}&access_token=${encodeURIComponent(env.META_PAGE_TOKEN)}`;
  const res = await metaFetch(url);
  if (!res.ok) throw await erroreGraph(res, "elenco dei moduli");
  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id).slice(0, MAX_MODULI);
}

async function leggiLead(env: Env, richieste: { modulo: string; dopo: string | null }[], da: number): Promise<PaginaGraph[]> {
  const perPagina = Math.max(1, Math.min(25, Math.floor(ID_PER_QUERY / richieste.length)));
  const filtro = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: da }]));
  const batch = richieste.map((r) => ({
    method: "GET",
    relative_url: `${r.modulo}/leads?fields=id,created_time,field_data&limit=${perPagina}&filtering=${filtro}${r.dopo ? `&after=${encodeURIComponent(r.dopo)}` : ""}`,
  }));
  const corpo = new URLSearchParams({ access_token: env.META_PAGE_TOKEN, include_headers: "false", batch: JSON.stringify(batch) });
  const res = await metaFetch(`${base(env)}/`, { method: "POST", body: corpo });
  if (!res.ok) throw await erroreGraph(res, "lettura dei lead");
  const risposte = (await res.json()) as ({ code: number; body: string } | null)[];
  return risposte.map((r, i) => {
    if (!r || r.code !== 200) {
      const msg = r ? ((JSON.parse(r.body || "{}") as { error?: { message?: string } }).error?.message ?? "") : "nessuna risposta";
      throw new Error(`lettura del modulo ${richieste[i].modulo}: Graph API ${r?.code ?? "?"}${msg ? `, ${msg}` : ""}`);
    }
    return JSON.parse(r.body) as PaginaGraph;
  });
}

// limite: quanti lead nuovi si possono registrare in questo giro (3 query l'uno). Costo fisso: 3 query (stato,
// controllo dei doppioni, salvataggio dello stato) e al massimo 2 sottorichieste.
export async function recuperaLeadMeta(env: Env, now: number, limite: number): Promise<{ spento?: true; nuovi: number; sottorichieste: number }> {
  if (eDemo(env) || !env.META_PAGE_TOKEN || !env.META_PAGE_ID) return { spento: true, nuovi: 0, sottorichieste: 0 };
  const db = getDb(env.DB);
  const riga = await db.select({ value: settings.value }).from(settings).where(inArray(settings.key, [CHIAVE_RECUPERO])).get();
  const nowS = Math.floor(now / 1000);
  const stato: StatoRecupero = riga ? (JSON.parse(riga.value) as StatoRecupero) : { da: nowS - GIORNI_PRIMO_GIRO * 86_400, moduli: [], moduliAt: 0, ciclo: null };
  let sottorichieste = 0;
  if (!stato.moduli.length || now - stato.moduliAt >= MODULI_OGNI_MS) {
    stato.moduli = await leggiModuli(env);
    stato.moduliAt = now;
    sottorichieste++;
  }
  const ciclo = stato.ciclo ?? { inizio: nowS, cursori: {} };
  const richieste = stato.moduli.slice(0, MAX_MODULI).filter((m) => ciclo.cursori[m] !== null).map((m) => ({ modulo: m, dopo: ciclo.cursori[m] ?? null }));
  let nuovi = 0;
  if (richieste.length) {
    const pagine = await leggiLead(env, richieste.slice(0, ID_PER_QUERY), stato.da);
    sottorichieste++;
    const trovati = pagine.flatMap((p, i) => (p.data ?? []).filter((l) => !eLeadDiProva(l)).map((l) => ({ ...l, form_id: richieste[i].modulo })));
    const ids = trovati.map((l) => l.id);
    const esistenti = ids.length
      ? new Set((await db.select({ id: leads.metaLeadId }).from(leads).where(inArray(leads.metaLeadId, ids)).all()).map((r) => r.id))
      : new Set<string | null>();
    const mancanti = trovati.filter((l) => !esistenti.has(l.id));
    for (const l of mancanti.slice(0, limite)) {
      const creato = l.created_time ? Date.parse(l.created_time) : NaN;
      if (await registerMetaLead(db, { leadgenId: l.id, formId: l.form_id ?? null }, Number.isFinite(creato) && creato <= now ? creato : now)) nuovi++;
    }
    // Se i lead nuovi superano il limite le pagine si rileggono al giro dopo (quelli registrati ora sono doppioni
    // e non costano). Altrimenti ogni modulo passa alla pagina dopo o finisce il suo ciclo.
    if (mancanti.length <= limite) {
      pagine.forEach((p, i) => { ciclo.cursori[richieste[i].modulo] = p.paging?.next ? (p.paging.cursors?.after ?? null) : null; });
    }
  }
  if (stato.moduli.every((m) => ciclo.cursori[m] === null)) {
    stato.da = ciclo.inizio - MARGINE_S;
    stato.ciclo = null;
  } else {
    stato.ciclo = ciclo;
  }
  const valore = JSON.stringify(stato);
  await db.insert(settings).values({ key: CHIAVE_RECUPERO, value: valore, updatedBy: null, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: valore, updatedAt: now } });
  return { nuovi, sottorichieste };
}
