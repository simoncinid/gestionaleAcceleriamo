import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, ne, or, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import { violaUnico, type Db } from "../db/client";
import { activities, auditLog, clients, documents, fees, leads, stages, users, type Activity, type Lead, type LeadSource, type Stage } from "../db/schema";
import { audit } from "../lib/audit";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { aE164 } from "../lib/telefono";
import { leggiImpostazioni } from "../impostazioni/service";
import { callPerFase } from "../regole/fasi-call";

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
  setupCents?: number | null;
  feeCents?: number | null;
  lostReason?: string | null;
  wonStartAt?: number | null;
};
export type LeadPatch = Partial<Omit<LeadInput, "source">> & { clientName?: string; callAt?: number };

export async function getStage(db: Db, id: string): Promise<Stage> {
  const stage = await db.select().from(stages).where(eq(stages.id, id)).get();
  if (!stage) throw new HTTPException(400, { message: "Fase inesistente" });
  return stage;
}

// I motivi di perdita validi sono quelli in Impostazioni, non l'elenco fisso dello schema.
// Restituisce l'etichetta del motivo, per lo storico.
export async function assertMotivo(db: Db, motivo: string | null | undefined): Promise<string | null> {
  if (!motivo) return null;
  const { motivi } = await leggiImpostazioni(db);
  const trovato = motivi.find((m) => m.id === motivo);
  if (!trovato) throw new HTTPException(422, { message: "Motivo non valido" });
  return trovato.etichetta;
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

export async function updateLead(db: Db, id: string, input: LeadPatch, actorId: string | null, now = Date.now()): Promise<Lead> {
  const { clientName, callAt: _callAt, ...patch } = input;
  const current = await getLead(db, id);
  if ("ownerId" in patch) await assertOwner(db, patch.ownerId);
  const stage = await getStage(db, patch.stageId ?? current.stageId);
  const stageChanged = patch.stageId !== undefined && patch.stageId !== current.stageId;
  await assertMotivo(db, patch.lostReason);
  // Motivo e dati del vinto si chiedono solo quando la fase cambia davvero:
  // un lead 1A già perso o già chiuso senza questi dati resta modificabile.
  if (stageChanged) {
    const motivo = patch.lostReason !== undefined ? patch.lostReason : current.lostReason;
    if (stage.requiresReason && !motivo) throw new HTTPException(422, { message: "Scegli il motivo" });
    if (stage.kind === "won") {
      const setup = patch.setupCents !== undefined ? patch.setupCents : current.setupCents;
      const canone = patch.feeCents !== undefined ? patch.feeCents : current.feeCents;
      const inizio = patch.wonStartAt !== undefined ? patch.wonStartAt : current.wonStartAt;
      if (setup == null || canone == null || inizio == null) throw new HTTPException(422, { message: "Per Cliente servono setup, canone e data di inizio" });
    }
  }
  const next: Partial<Lead> = { ...patch, updatedAt: now };
  // La pausa vale solo nella fase in cui è nata: cambiando fase si toglie.
  if (stageChanged) { next.stageChangedAt = now; next.pausedUntil = null; }

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
    if (stage.kind === "won") await creaClienteDaLead(db, await getLead(db, id), clientName, actorId, now);
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    const before = current[key as keyof Lead];
    if (value !== before) changes[key] = { from: before, to: value };
  }
  await audit(db, actorId, "lead", id, "update", changes, now);
  return getLead(db, id);
}

/** Cliente collegato a un lead vinto (null se non esiste). */
export async function clienteDelLead(db: Db, leadId: string): Promise<{ id: string; name: string } | null> {
  const c = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.originLeadId, leadId), isNull(clients.deletedAt)))
    .get();
  return c ?? null;
}

// Alla chiusura vinta nasce il cliente con il suo canone in attesa. Idempotente:
// se il lead ha già un cliente (anche dopo riapertura e nuova chiusura) non se ne crea un altro.
export async function creaClienteDaLead(db: Db, lead: Lead, nome: string | undefined, actorId: string | null, now: number) {
  if (await clienteDelLead(db, lead.id)) return;
  const clientId = crypto.randomUUID();
  const nomeCliente = nome ?? lead.company;
  try {
    await db.insert(clients).values({ id: clientId, name: nomeCliente, scope: "acceleriamo", originLeadId: lead.id, createdAt: now });
  } catch (err) {
    // Due chiusure insieme: l'indice unico (migrazione 0012) ferma la seconda, che non crea niente.
    if (violaUnico(err)) return;
    throw err;
  }
  if (lead.feeCents && lead.feeCents > 0) {
    await db.insert(fees).values({ id: crypto.randomUUID(), clientId, amountCents: lead.feeCents, billingDay: 1, status: "in_attesa", startAt: lead.wonStartAt });
  }
  await addActivity(db, lead.id, "nota", `Cliente creato: ${nomeCliente}`, actorId, now);
  await audit(db, actorId, "client", clientId, "create", { originLeadId: { from: null, to: lead.id } }, now);
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

// Viste fisse della vista elenco (spec 6.5): le fasi di ciascuna.
export type Vista = "nuovi" | "da-richiamare" | "in-attesa" | "in-pausa" | "scartati";
export const VISTE: Record<Vista, string[]> = {
  nuovi: ["da-chiamare-prima-volta"],
  "da-richiamare": ["da-richiamare"],
  "in-attesa": ["in-attesa-preventivo", "in-attesa-decisione"],
  // In pausa non è una fase: sono i lead con paused_until (vedi listLeads).
  "in-pausa": [],
  scartati: ["non-chiuso", "fake"],
};

export type LeadFilters = {
  q?: string; stageId?: string; source?: string; campaign?: string; ownerId?: string; deleted?: boolean;
  score?: "verde" | "giallo" | "grigio"; vista?: Vista; da?: number; a?: number;
};

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
  if (f.score) conds.push(eq(leads.score, f.score));
  // In attesa e in pausa non si sovrappongono: il lead in pausa sta solo nella sua vista.
  if (f.vista === "in-pausa") conds.push(isNotNull(leads.pausedUntil));
  else if (f.vista === "in-attesa") conds.push(isNull(leads.pausedUntil), inArray(leads.stageId, VISTE[f.vista]));
  else if (f.vista && Object.hasOwn(VISTE, f.vista)) conds.push(inArray(leads.stageId, VISTE[f.vista]));
  if (f.da) conds.push(gte(leads.createdAt, f.da));
  if (f.a) conds.push(lte(leads.createdAt, f.a));
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
      attemptCount: leads.attemptCount,
      score: leads.score,
      setupCents: leads.setupCents,
      feeCents: leads.feeCents,
      sequenceStep: leads.sequenceStep,
    })
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.updatedAt))
    .limit(2000);
}

export type AzioneMultipla = { ids: string[]; azione: "responsabile" | "fase" | "cestino"; valore?: string | null };

// Spec 6.5: tre azioni sulla selezione. Le fasi che chiedono un motivo o i dati del vinto si scelgono lead per lead.
// Le letture stanno prima, le scritture in un solo db.batch (tutto o niente). I lead nel cestino o sconosciuti si saltano.
export async function azioniMultiple(db: Db, input: AzioneMultipla, actorId: string, now = Date.now()): Promise<{ fatti: number }> {
  const fase = input.azione === "fase" ? await db.select().from(stages).where(eq(stages.id, input.valore ?? "")).get() : undefined;
  if (input.azione === "fase") {
    if (!fase) throw new HTTPException(422, { message: "Fase inesistente" });
    if (fase.requiresReason || fase.kind === "won" || callPerFase(fase.id)) throw new HTTPException(422, { message: "Questa fase va scelta lead per lead" });
  }
  if (input.azione === "responsabile") await assertOwner(db, input.valore);
  const trovati = await db.select().from(leads).where(and(inArray(leads.id, [...new Set(input.ids)]), isNull(leads.deletedAt)));
  if (trovati.length === 0) return { fatti: 0 };

  const passi: BatchItem<"sqlite">[] = [];
  const voce = (leadId: string, action: string, changes?: unknown) =>
    db.insert(auditLog).values({ id: crypto.randomUUID(), userId: actorId, entity: "lead", entityId: leadId, action, changes: changes === undefined ? null : JSON.stringify(changes), createdAt: now });
  const attivita = (leadId: string, type: Activity["type"], body: string) =>
    db.insert(activities).values({ id: crypto.randomUUID(), leadId, type, body, authorId: actorId, createdAt: now });

  if (input.azione === "cestino") {
    for (const l of trovati) {
      passi.push(db.update(leads).set({ deletedAt: now, updatedAt: now }).where(eq(leads.id, l.id)));
      passi.push(attivita(l.id, "cestino", "Spostato nel cestino"), voce(l.id, "delete"));
    }
  } else if (input.azione === "responsabile") {
    const ownerId = input.valore ?? null;
    for (const l of trovati) {
      passi.push(db.update(leads).set({ ownerId, updatedAt: now }).where(eq(leads.id, l.id)));
      passi.push(voce(l.id, "update", l.ownerId === ownerId ? {} : { ownerId: { from: l.ownerId, to: ownerId } }));
    }
  } else {
    const nuova = fase!;
    const etichette = new Map((await db.select({ id: stages.id, label: stages.label }).from(stages)).map((s) => [s.id, s.label]));
    for (const l of trovati) {
      if (l.stageId === nuova.id) continue;
      // Un lead aperto ha sempre una prossima azione: chi arriva da una fase chiusa prende quella proposta dalla fase.
      const aperta = nuova.kind === "open";
      const nextAction = aperta ? (l.nextAction ?? nuova.suggestedNextAction ?? DEFAULT_NEXT_ACTION) : null;
      const nextActionAt = aperta ? (l.nextActionAt ?? now + (nuova.suggestedDelayHours ?? 0) * 3_600_000) : null;
      passi.push(db.update(leads).set({ stageId: nuova.id, stageChangedAt: now, pausedUntil: null, nextAction, nextActionAt, updatedAt: now }).where(eq(leads.id, l.id)));
      passi.push(attivita(l.id, "cambio_fase", `Da "${etichette.get(l.stageId) ?? l.stageId}" a "${nuova.label}"`));
      const changes: Record<string, { from: unknown; to: unknown }> = { stageId: { from: l.stageId, to: nuova.id } };
      if (nextAction !== l.nextAction) changes.nextAction = { from: l.nextAction, to: nextAction };
      if (nextActionAt !== l.nextActionAt) changes.nextActionAt = { from: l.nextActionAt, to: nextActionAt };
      passi.push(voce(l.id, "update", changes));
    }
  }
  if (passi.length) await db.batch(passi as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { fatti: trovati.length };
}
