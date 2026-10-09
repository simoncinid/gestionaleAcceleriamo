import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { Db } from "../db/client";
import { activities, calls, leads, proposals, PROPOSAL_STATUSES } from "../db/schema";
import { contestoRegole } from "../impostazioni/service";
import { passiProposta } from "../regole/applica";
import { propostaEvento, type Contesto } from "../regole/motore";
import { alleOre } from "../regole/orario";
import type { propostaManualeSchema, propostaPatchSchema } from "./schema";

export type PropostaRiga = {
  id: string; number: string; leadId: string | null; company: string; status: (typeof PROPOSAL_STATUSES)[number]; option: "standard" | "proprieta";
  setupCents: number | null; feeCents: number | null; hoursEstimate: number | null; alternativeCents: number | null; validUntil: number | null;
  sentAt: number | null; presentedAt: number | null; pdfUrl: string | null; sourcePath: string | null; objections: string | null;
  nextActionAt: number | null; version: number;
};

const COLONNE = {
  id: proposals.id, number: proposals.number, leadId: proposals.leadId, company: sql<string>`coalesce(${leads.company}, ${proposals.company}, '')`,
  status: proposals.status, option: proposals.option, setupCents: proposals.setupCents, feeCents: proposals.feeCents, hoursEstimate: proposals.hoursEstimate,
  alternativeCents: proposals.alternativeCents, validUntil: proposals.validUntil, sentAt: proposals.sentAt, presentedAt: proposals.presentedAt,
  pdfUrl: proposals.pdfUrl, sourcePath: proposals.sourcePath, objections: proposals.objections, nextActionAt: leads.nextActionAt, version: proposals.version,
};

const righe = (db: Db) => db.select(COLONNE).from(proposals).leftJoin(leads, eq(leads.id, proposals.leadId));

// Le proposte dei lead cestinati spariscono con il lead; quelle senza lead restano (da abbinare).
export const elencoProposte = (db: Db): Promise<PropostaRiga[]> => righe(db).where(and(isNull(proposals.deletedAt), or(isNull(proposals.leadId), isNull(leads.deletedAt)))).orderBy(desc(proposals.updatedAt));
export const proposteDelLead = (db: Db, leadId: string): Promise<PropostaRiga[]> => righe(db).where(and(eq(proposals.leadId, leadId), isNull(proposals.deletedAt))).orderBy(desc(proposals.updatedAt));

export async function unaProposta(db: Db, id: string): Promise<PropostaRiga> {
  const [p] = await righe(db).where(and(eq(proposals.id, id), isNull(proposals.deletedAt)));
  if (!p) throw new HTTPException(404, { message: "Proposta non trovata" });
  return p;
}

export const ricontattiDi = (base: number, ctx: Contesto) => ctx.ricontatti.map((g) => alleOre(base, g, 10, 0, ctx.orario));

// Una proposta diventa "registrata": data di invio, prezzo sul lead, regola "Fissare la call di presentazione".
export async function passiRegistrata(db: Db, leadId: string, p: { setupCents: number | null; feeCents: number | null }, actorId: string | null, now: number): Promise<BatchItem<"sqlite">[]> {
  const pres = await db.select({ id: calls.id }).from(calls).where(and(eq(calls.leadId, leadId), eq(calls.kind, "presentazione"), isNull(calls.deletedAt))).get();
  const ctx = await contestoRegole(db, now);
  return [
    db.update(leads).set({ setupCents: p.setupCents, feeCents: p.feeCents }).where(eq(leads.id, leadId)),
    ...(await passiProposta(db, leadId, propostaEvento({ tipo: "proposta_registrata", haCallPresentazione: Boolean(pres) }, ctx), actorId, now)),
  ];
}

export async function creaAMano(db: Db, input: z.infer<typeof propostaManualeSchema>, actorId: string, now: number) {
  if (await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.number, input.number)).get()) throw new HTTPException(422, { message: `Il numero ${input.number} esiste già` });
  if (!(await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt))).get())) throw new HTTPException(422, { message: "Lead non trovato" });
  const id = crypto.randomUUID();
  const registrata = input.status === "registrata";
  await db.batch([
    db.insert(proposals).values({ id, leadId: input.leadId, number: input.number, option: input.option, setupCents: input.setupCents ?? null, feeCents: input.feeCents ?? null, hoursEstimate: input.hoursEstimate ?? null, alternativeCents: input.alternativeCents ?? null, validUntil: input.validUntil ?? null, pdfUrl: input.pdfUrl ?? null, status: input.status, sentAt: registrata ? now : null, registeredVia: "manuale", createdAt: now, updatedAt: now }),
    db.insert(activities).values({ id: crypto.randomUUID(), leadId: input.leadId, type: "proposta", body: `Preventivo ${input.number} inserito a mano`, authorId: actorId, createdAt: now }),
    ...(registrata ? await passiRegistrata(db, input.leadId, { setupCents: input.setupCents ?? null, feeCents: input.feeCents ?? null }, actorId, now) : []),
  ]);
  return unaProposta(db, id);
}

export async function aggiornaProposta(db: Db, id: string, input: z.infer<typeof propostaPatchSchema>, actorId: string, now: number) {
  const prima = await unaProposta(db, id);
  const set: Partial<typeof proposals.$inferInsert> = { updatedAt: now };
  for (const k of ["option", "setupCents", "feeCents", "alternativeCents", "validUntil", "pdfUrl", "objections"] as const) if (input[k] !== undefined) (set as Record<string, unknown>)[k] = input[k];
  const passi: BatchItem<"sqlite">[] = [];
  const cambio = input.status && input.status !== prima.status ? input.status : null;
  if (cambio) {
    set.status = cambio;
    if (cambio === "registrata") set.sentAt = now;
    if (cambio === "presentata") set.presentedAt = now;
    if (["accettata", "rifiutata", "scaduta"].includes(cambio)) set.decidedAt = now;
  }
  if (prima.leadId && cambio) {
    const ctx = await contestoRegole(db, now);
    if (cambio === "registrata") passi.push(...(await passiRegistrata(db, prima.leadId, { setupCents: set.setupCents ?? prima.setupCents, feeCents: set.feeCents ?? prima.feeCents }, actorId, now)));
    if (cambio === "presentata") passi.push(...(await passiProposta(db, prima.leadId, propostaEvento({ tipo: "proposta_senza_call", sentAt: now }, ctx), actorId, now)));
    if (cambio === "accettata") {
      const proprieta = (input.option ?? prima.option) === "proprieta";
      const setup = proprieta ? (input.alternativeCents ?? prima.alternativeCents ?? input.setupCents ?? prima.setupCents) : (input.setupCents ?? prima.setupCents);
      passi.push(db.update(leads).set({ setupCents: setup, feeCents: proprieta ? null : (input.feeCents ?? prima.feeCents), updatedAt: now }).where(eq(leads.id, prima.leadId)));
    }
    passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId: prima.leadId, type: "proposta", body: `Preventivo ${prima.number}: ${cambio}`, authorId: actorId, createdAt: now }));
  }
  await db.batch([db.update(proposals).set(set).where(eq(proposals.id, id)), ...passi]);
  return unaProposta(db, id);
}

export async function abbina(db: Db, id: string, leadId: string, actorId: string, now: number) {
  const p = await unaProposta(db, id);
  const l = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), isNull(leads.deletedAt))).get();
  if (!l) throw new HTTPException(422, { message: "Lead non trovato" });
  const passi: BatchItem<"sqlite">[] = [
    db.update(proposals).set({ leadId, updatedAt: now }).where(eq(proposals.id, id)),
    db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "proposta", body: `Preventivo ${p.number} abbinato a questo lead`, authorId: actorId, createdAt: now }),
  ];
  if (p.status === "registrata") passi.push(...(await passiRegistrata(db, leadId, p, actorId, now)));
  await db.batch(passi as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return unaProposta(db, id);
}
