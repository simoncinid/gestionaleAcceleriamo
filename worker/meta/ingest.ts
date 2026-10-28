import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { leads } from "../db/schema";
import type { Env } from "../env";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { aE164 } from "../lib/telefono";
import { catenaLeadNuovo } from "../regole/catena";
import { DEFAULT_NEXT_ACTION, addActivity, arrivatoDiNuovo, cercaDoppioni, firstOpenStage, riscontro } from "../leads/service";
import { metaFetch } from "./fetcher";
import { eDemo, NIENTE_IN_DEMO } from "../lib/demo";

export const MAX_META_ATTEMPTS = 10;
// Un lead Meta arrivato da più di 48 ore (primo import del recupero) entra senza catena: niente email di conferma
// né avviso "Lead nuovo" per un contatto di settimane fa. Fase e prossima azione si decidono a mano.
export const ARRETRATO_MS = 48 * 3_600_000;

type GraphLead = {
  field_data?: { name: string; values?: string[] }[];
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  form_id?: string;
};

export async function fetchMetaLead(env: Env, leadgenId: string) {
  if (eDemo(env)) throw new Error(NIENTE_IN_DEMO);
  const url =
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,campaign_name,adset_name,ad_name,form_id&access_token=${encodeURIComponent(env.META_PAGE_TOKEN)}`;
  const res = await metaFetch(url);
  if (!res.ok) throw new Error(`Graph API ${res.status}`);
  const data = (await res.json()) as GraphLead;
  const fields: Record<string, string> = {};
  for (const f of data.field_data ?? []) fields[f.name] = (f.values ?? []).join(", ");
  return { fields, campaign: data.campaign_name ?? null, adset: data.adset_name ?? null, ad: data.ad_name ?? null, formId: data.form_id ?? null };
}

const pick = (f: Record<string, string>, keys: string[]) => {
  for (const k of keys) {
    const v = f[k]?.trim();
    if (v) return v;
  }
  return null;
};

export function mapMetaFields(f: Record<string, string>) {
  const first = pick(f, ["first_name", "nome"]);
  const last = pick(f, ["last_name", "cognome"]);
  const contactName = pick(f, ["full_name", "nome_e_cognome", "nome_completo"]) ?? ([first, last].filter(Boolean).join(" ") || null);
  return {
    company: pick(f, ["company_name", "azienda", "nome_azienda", "nome_dell'azienda", "company"]),
    contactName,
    email: pick(f, ["email", "e-mail", "work_email"]),
    phone: pick(f, ["phone_number", "telefono", "numero_di_telefono", "work_phone_number"]),
    website: pick(f, ["website", "sito_web", "sito", "sito_internet"]),
  };
}

export async function registerMetaLead(db: Db, input: { leadgenId: string; formId: string | null }, now = Date.now()) {
  const stage = await firstOpenStage(db);
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(leads)
    .values({
      id,
      company: "Lead Meta in arrivo",
      source: "meta",
      metaLeadId: input.leadgenId,
      metaFormId: input.formId,
      metaStatus: "pending",
      stageId: stage.id,
      stageChangedAt: now,
      nextAction: DEFAULT_NEXT_ACTION,
      nextActionAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: leads.metaLeadId })
    .returning({ id: leads.id });
  if (!inserted.length) return null;
  await addActivity(db, id, "meta", "Lead arrivato dal modulo Meta", null, now);
  return id;
}

export async function fillMetaLead(env: Env, leadId: string, now = Date.now()) {
  const db = getDb(env.DB);
  const lead = await db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead?.metaLeadId) return false;
  try {
    const data = await fetchMetaLead(env, lead.metaLeadId);
    const m = mapMetaFields(data.fields);
    const emailNorm = normalizeEmail(m.email);
    const phoneNorm = normalizePhone(m.phone);
    // Doppioni (modifica 8): con un lead aperto, cliente o in 80 il lead in arrivo non resta (esce dagli elenchi, non va nel cestino)
    // e sull'altro compare "Arrivato di nuovo da Meta"; con uno in 90 o nel cestino resta, con l'avviso "Possibile doppione".
    const r = riscontro(await cercaDoppioni(db, emailNorm, phoneNorm, leadId));
    const assorbito = r != null && r.tipo !== "possibile";
    await db
      .update(leads)
      .set({
        company: m.company ?? m.contactName ?? "Lead Meta senza nome",
        contactName: m.contactName,
        email: m.email,
        emailNorm,
        phone: aE164(m.phone) ?? m.phone,
        phoneNorm,
        website: m.website,
        metaAnswers: JSON.stringify(data.fields),
        metaCampaign: data.campaign,
        metaAdset: data.adset,
        metaAd: data.ad,
        metaFormId: data.formId ?? lead.metaFormId,
        metaStatus: "ok",
        duplicateOfId: r?.lead.id ?? null,
        ...(assorbito ? { deletedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));
    if (assorbito) {
      await arrivatoDiNuovo(db, r, "Meta", null, now);
      return true;
    }
    if (r) await addActivity(db, leadId, "nota", `Possibile doppione di ${r.lead.company}${r.lead.deletedAt ? " (nel cestino)" : ""}`, null, now);
  } catch (err) {
    console.error("meta_fill_failed", leadId, err);
    await db
      .update(leads)
      .set({ metaStatus: "error", metaAttempts: lead.metaAttempts + 1, updatedAt: now })
      .where(eq(leads.id, leadId));
    return false;
  }
  if (now - lead.createdAt > ARRETRATO_MS) return true;
  // Fuori dal try: se la catena fallisce il lead resta riempito ("ok") e non torna tra quelli da riprovare.
  try {
    await catenaLeadNuovo(env, leadId, "meta", now);
  } catch (err) {
    console.error("catena_lead_nuovo_fallita", leadId, err);
  }
  return true;
}

// `limite`: il cron ne completa pochi per giro (ogni lead costa una chiamata a Meta e la sua catena).
export async function retryPendingMetaLeads(env: Env, limite = 20, now = Date.now()) {
  const db = getDb(env.DB);
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(inArray(leads.metaStatus, ["pending", "error"]), lt(leads.metaAttempts, MAX_META_ATTEMPTS), isNull(leads.deletedAt)))
    .limit(limite);
  let ok = 0;
  for (const row of rows) if (await fillMetaLead(env, row.id, now)) ok++;
  return ok;
}
