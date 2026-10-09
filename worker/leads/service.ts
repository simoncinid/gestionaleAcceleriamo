import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, documents, leads, stages, users, type Activity, type Lead, type LeadSource, type Stage } from "../db/schema";
import { audit } from "../lib/audit";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { aE164 } from "../lib/telefono";

export const DEFAULT_NEXT_ACTION = "Prima chiamata";

export type LeadInput = {
  company: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedinText?: string | null;
  source?: LeadSource;
  stageId?: string;
  estimatedValue?: number | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: number | null;
  appointmentAt?: number | null;
  meetLink?: string | null;
  proposalUrl?: string | null;
  notes?: string | null;
};
export type LeadPatch = Partial<Omit<LeadInput, "source">>;

export async function getStage(db: Db, id: string): Promise<Stage> {
  const stage = await db.select().from(stages).where(eq(stages.id, id)).get();
  if (!stage) throw new HTTPException(400, { message: "Fase inesistente" });
  return stage;
}

export async function firstOpenStage(db: Db): Promise<Stage> {
  const stage = await db.select().from(stages).where(eq(stages.kind, "open")).orderBy(asc(stages.sortOrder)).get();
  if (!stage) throw new Error("Nessuna fase aperta configurata");
  return stage;
}

async function assertOwner(db: Db, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).get();
  if (!user) throw new HTTPException(400, { message: "Responsabile inesistente" });
}

export async function findDuplicate(db: Db, emailNorm: string | null, phoneNorm: string | null, excludeId?: string) {
  const matches: SQL[] = [];
  if (emailNorm) matches.push(eq(leads.emailNorm, emailNorm));
  if (phoneNorm) matches.push(eq(leads.phoneNorm, phoneNorm));
  if (!matches.length) return null;
  const row = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(isNull(leads.deletedAt), or(...matches), excludeId ? ne(leads.id, excludeId) : undefined))
    .orderBy(asc(leads.createdAt))
    .get();
  return row?.id ?? null;
}

export async function addActivity(db: Db, leadId: string, type: Activity["type"], body: string, authorId: string | null, now = Date.now()) {
  await db.insert(activities).values({ id: crypto.randomUUID(), leadId, type, body, authorId, createdAt: now });
}

export async function getLead(db: Db, id: string, opts: { includeDeleted?: boolean } = {}): Promise<Lead> {
  const lead = await db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead || (lead.deletedAt && !opts.includeDeleted)) throw new HTTPException(404, { message: "Lead non trovato" });
  return lead;
}

export async function createLead(db: Db, input: LeadInput, actorId: string | null, now = Date.now()): Promise<Lead> {
  const stage = input.stageId ? await getStage(db, input.stageId) : await firstOpenStage(db);
  await assertOwner(db, input.ownerId);
  const emailNorm = normalizeEmail(input.email);
  const phoneNorm = normalizePhone(input.phone);
  const isOpen = stage.kind === "open";
  const id = crypto.randomUUID();
  await db.insert(leads).values({
    id,
    company: input.company,
    contactName: input.contactName ?? null,
    email: input.email ?? null,
    emailNorm,
    phone: aE164(input.phone) ?? input.phone ?? null,
    phoneNorm,
    website: input.website ?? null,
    linkedinText: input.linkedinText ?? null,
    source: input.source ?? "manuale",
    stageId: stage.id,
    stageChangedAt: now,
    estimatedValue: input.estimatedValue ?? null,
    ownerId: input.ownerId ?? null,
    nextAction: isOpen ? (input.nextAction ?? DEFAULT_NEXT_ACTION) : null,
    nextActionAt: isOpen ? (input.nextActionAt ?? now) : null,
    appointmentAt: input.appointmentAt ?? null,
    meetLink: input.meetLink ?? null,
    proposalUrl: input.proposalUrl ?? null,
    notes: input.notes ?? null,
    duplicateOfId: await findDuplicate(db, emailNorm, phoneNorm),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  await addActivity(db, id, "creazione", `Lead creato (${input.source ?? "manuale"})`, actorId, now);
  await audit(db, actorId, "lead", id, "create", undefined, now);
  return getLead(db, id);
}

export async function updateLead(db: Db, id: string, patch: LeadPatch, actorId: string | null, now = Date.now()): Promise<Lead> {
  const current = await getLead(db, id);
  if ("ownerId" in patch) await assertOwner(db, patch.ownerId);
  const stage = await getStage(db, patch.stageId ?? current.stageId);
  const stageChanged = patch.stageId !== undefined && patch.stageId !== current.stageId;
  const next: Partial<Lead> = { ...patch, updatedAt: now };
  if (stageChanged) next.stageChangedAt = now;

  if (stage.kind === "open") {
    const at = patch.nextActionAt !== undefined ? patch.nextActionAt : current.nextActionAt;
    const action = patch.nextAction !== undefined ? patch.nextAction : current.nextAction;
    if (!at || !action) throw new HTTPException(422, { message: "Serve una prossima azione con data per i lead aperti" });
  } else {
    next.nextAction = null;
    next.nextActionAt = null;
  }

  if ("email" in patch || "phone" in patch) {
    const emailNorm = "email" in patch ? normalizeEmail(patch.email) : current.emailNorm;
    const phoneNorm = "phone" in patch ? normalizePhone(patch.phone) : current.phoneNorm;
    next.emailNorm = emailNorm;
    next.phoneNorm = phoneNorm;
    next.duplicateOfId = await findDuplicate(db, emailNorm, phoneNorm, id);
    // Telefono in E.164 (DS 2.2); la chiave dei doppioni resta phoneNorm.
    if ("phone" in patch) next.phone = aE164(patch.phone) ?? patch.phone ?? null;
  }

  await db.update(leads).set(next).where(eq(leads.id, id));

  if (stageChanged) {
    const from = await getStage(db, current.stageId);
    await addActivity(db, id, "cambio_fase", `Da "${from.label}" a "${stage.label}"`, actorId, now);
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    const before = current[key as keyof Lead];
    if (value !== before) changes[key] = { from: before, to: value };
  }
  await audit(db, actorId, "lead", id, "update", changes, now);
  return getLead(db, id);
}

export async function softDeleteLead(db: Db, id: string, actorId: string | null, now = Date.now()) {
  await getLead(db, id);
  await db.update(leads).set({ deletedAt: now, updatedAt: now }).where(eq(leads.id, id));
  await addActivity(db, id, "cestino", "Spostato nel cestino", actorId, now);
  await audit(db, actorId, "lead", id, "delete", undefined, now);
}

export async function restoreLead(db: Db, id: string, actorId: string | null, now = Date.now()) {
  const lead = await getLead(db, id, { includeDeleted: true });
  if (!lead.deletedAt) return;
  await db.update(leads).set({ deletedAt: null, updatedAt: now }).where(eq(leads.id, id));
  await addActivity(db, id, "ripristino", "Ripristinato dal cestino", actorId, now);
  await audit(db, actorId, "lead", id, "restore", undefined, now);
}

const FILLABLE = ["contactName", "email", "phone", "website", "linkedinText", "estimatedValue", "meetLink", "proposalUrl", "metaAnswers", "metaCampaign", "metaAdset", "metaAd"] as const;

export async function mergeLeads(db: Db, sourceId: string, targetId: string, actorId: string | null, now = Date.now()): Promise<Lead> {
  if (sourceId === targetId) throw new HTTPException(400, { message: "Non puoi unire un lead con se stesso" });
  const source = await getLead(db, sourceId);
  const target = await getLead(db, targetId);
  const fill: Partial<Lead> = { updatedAt: now };
  for (const key of FILLABLE) {
    if ((target[key] === null || target[key] === "") && source[key] !== null) (fill as Record<string, unknown>)[key] = source[key];
  }
  if (source.notes) fill.notes = target.notes ? `${target.notes}\n\n${source.notes}` : source.notes;
  const email = fill.email ?? target.email;
  const phone = fill.phone ?? target.phone;
  fill.emailNorm = normalizeEmail(email);
  fill.phoneNorm = normalizePhone(phone);
  if (target.duplicateOfId === sourceId) fill.duplicateOfId = null;

  await db.update(activities).set({ leadId: targetId }).where(eq(activities.leadId, sourceId));
  await db.update(documents).set({ leadId: targetId }).where(eq(documents.leadId, sourceId));
  await db.update(leads).set(fill).where(eq(leads.id, targetId));
  await db.update(leads).set({ deletedAt: now, updatedAt: now, duplicateOfId: targetId }).where(eq(leads.id, sourceId));
  await addActivity(db, targetId, "unione", `Unito il lead "${source.company}"`, actorId, now);
  await audit(db, actorId, "lead", targetId, "merge", { sourceId }, now);
  return getLead(db, targetId);
}

export type LeadFilters = { q?: string; stageId?: string; source?: string; campaign?: string; ownerId?: string; deleted?: boolean };

export async function listLeads(db: Db, f: LeadFilters) {
  const conds: (SQL | undefined)[] = [f.deleted ? isNotNull(leads.deletedAt) : isNull(leads.deletedAt)];
  if (f.stageId) conds.push(eq(leads.stageId, f.stageId));
  if (f.source) conds.push(eq(leads.source, f.source as LeadSource));
  if (f.campaign) conds.push(eq(leads.metaCampaign, f.campaign));
  if (f.ownerId) conds.push(eq(leads.ownerId, f.ownerId));
  if (f.q?.trim()) {
    const p = `%${f.q.trim()}%`;
    conds.push(or(like(leads.company, p), like(leads.contactName, p), like(leads.email, p), like(leads.phone, p), like(leads.notes, p)));
  }
  return db
    .select({
      id: leads.id,
      company: leads.company,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      metaCampaign: leads.metaCampaign,
      metaStatus: leads.metaStatus,
      stageId: leads.stageId,
      stageChangedAt: leads.stageChangedAt,
      estimatedValue: leads.estimatedValue,
      ownerId: leads.ownerId,
      nextAction: leads.nextAction,
      nextActionAt: leads.nextActionAt,
      appointmentAt: leads.appointmentAt,
      duplicateOfId: leads.duplicateOfId,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      deletedAt: leads.deletedAt,
    })
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.updatedAt))
    .limit(2000);
}
