import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { leads } from "../db/schema";
import type { Env } from "../env";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { DEFAULT_NEXT_ACTION, addActivity, findDuplicate, firstOpenStage } from "../leads/service";
import { metaFetch } from "./fetcher";

export const MAX_META_ATTEMPTS = 10;

type GraphLead = {
  field_data?: { name: string; values?: string[] }[];
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  form_id?: string;
};

export async function fetchMetaLead(env: Env, leadgenId: string) {
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
    await db
      .update(leads)
      .set({
        company: m.company ?? m.contactName ?? "Lead Meta senza nome",
        contactName: m.contactName,
        email: m.email,
        emailNorm,
        phone: m.phone,
        phoneNorm,
        website: m.website,
        metaAnswers: JSON.stringify(data.fields),
        metaCampaign: data.campaign,
        metaAdset: data.adset,
        metaAd: data.ad,
        metaFormId: data.formId ?? lead.metaFormId,
        metaStatus: "ok",
        duplicateOfId: await findDuplicate(db, emailNorm, phoneNorm, leadId),
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));
    return true;
  } catch (err) {
    console.error("meta_fill_failed", leadId, err);
    await db
      .update(leads)
      .set({ metaStatus: "error", metaAttempts: lead.metaAttempts + 1, updatedAt: now })
      .where(eq(leads.id, leadId));
    return false;
  }
}

export async function retryPendingMetaLeads(env: Env) {
  const db = getDb(env.DB);
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(inArray(leads.metaStatus, ["pending", "error"]), lt(leads.metaAttempts, MAX_META_ATTEMPTS), isNull(leads.deletedAt)))
    .limit(20);
  let ok = 0;
  for (const row of rows) if (await fillMetaLead(env, row.id)) ok++;
  return ok;
}
