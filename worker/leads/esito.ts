import { linkHttp } from "./validation";
import { assertCallFutura } from "../calls/service";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Db } from "../db/client";
import { activities, auditLog, calls, leads, messageTemplates, type Lead } from "../db/schema";
import { callPerFase } from "../regole/fasi-call";
import { ESITI, type Esito } from "../regole/motore";
import { assertMotivo, getLead, getStage } from "./service";

export const esitoSchema = z
  .object({
    requestId: z.string().uuid(),
    esito: z.enum(ESITI),
    stageId: z.string().min(1),
    nextAction: z.string().trim().max(300).nullable(),
    nextActionAt: z.number().int().nullable(),
    // Stringa libera: i motivi validi stanno in Impostazioni e si controllano qui sotto.
    lostReason: z.string().min(1).max(40).nullish(),
    note: z.string().trim().max(4000).optional(),
    call: z
      .object({ kind: z.enum(["conoscenza", "presentazione"]), scheduledAt: z.number().int(), meetLink: linkHttp("Link Meet non valido").nullable() })
      .strict()
      .optional(),
  })
  .strict();
export type EsitoInput = z.infer<typeof esitoSchema>;

const ETICHETTE: Record<Esito, string> = {
  risposto: "Risposto",
  non_risponde: "Non risponde",
  occupato: "Occupato",
  richiamare: "Richiamare",
  appuntamento: "Consulenza fissata",
  non_interessato: "Non interessato",
  fuori_target: "Non profilato",
  consulenza_fatta: "Consulenza fatta",
  presentazione_fissata: "Presentazione fissata",
  presentazione_fatta: "Presentazione fatta",
};
// Gli esiti che chiudono la call in programma di quel tipo (resta una sola strada per dire "fatta").
const CALL_FATTA: Partial<Record<Esito, "conoscenza" | "presentazione">> = { consulenza_fatta: "conoscenza", presentazione_fatta: "presentazione" };
const TENTATIVI: Esito[] = ["non_risponde", "occupato"];

export async function primoTentativoAt(db: Db, leadId: string): Promise<number | null> {
  const r = await db
    .select({ at: activities.createdAt })
    .from(activities)
    .where(and(eq(activities.leadId, leadId), eq(activities.attemptNo, 1)))
    .orderBy(desc(activities.createdAt))
    .get();
  return r?.at ?? null;
}

const giaFatto = (db: Db, requestId: string) => db.select({ id: activities.id }).from(activities).where(eq(activities.requestId, requestId)).get();

// Un solo PATCH, una sola transazione D1 (db.batch): attività, fase, prossima azione, call.
// D1 non ha transazioni interattive: le letture stanno prima, le scritture tutte nel batch (tutto o niente).
export async function salvaEsito(db: Db, leadId: string, input: EsitoInput, userId: string, now: number): Promise<{ lead: Lead; duplicato: boolean; callId: string | null }> {
  if (await giaFatto(db, input.requestId)) return { lead: await getLead(db, leadId), duplicato: true, callId: null };
  const lead = await getLead(db, leadId);
  const stage = await getStage(db, input.stageId);
  const cambiaFase = stage.id !== lead.stageId;
  await assertMotivo(db, input.lostReason);
  // Come nel PATCH del lead: motivo e blocco su Chiuso solo quando la fase cambia davvero.
  if (cambiaFase && stage.requiresReason && !input.lostReason) throw new HTTPException(422, { message: "Scegli il motivo" });
  if (cambiaFase && stage.kind === "won") throw new HTTPException(422, { message: "Per segnare Cliente usa il cambio di fase nella scheda lead" });
  if (stage.kind === "open" && (!input.nextAction || !input.nextActionAt)) throw new HTTPException(422, { message: "Serve una prossima azione con data per i lead aperti" });
  if (input.call) assertCallFutura(input.call.scheduledAt, now);
  // Come nel PATCH del lead (Q14): nelle fasi che esistono solo con una call fissata si entra con la call nell'esito
  // oppure con una call di quel tipo già in programma.
  const kindCall = cambiaFase ? callPerFase(stage.id) : null;
  if (kindCall && input.call?.kind !== kindCall) {
    const esistente = await db.select({ id: calls.id }).from(calls)
      .where(and(eq(calls.leadId, leadId), eq(calls.kind, kindCall), isNull(calls.deletedAt), isNull(calls.outcome), gte(calls.scheduledAt, now))).get();
    if (!esistente) throw new HTTPException(422, { message: "Per questa fase serve la call: scegli giorno e ora" });
  }

  const kindFatta = CALL_FATTA[input.esito];
  const callAperta = kindFatta
    ? await db.select({ id: calls.id }).from(calls)
      .where(and(eq(calls.leadId, leadId), eq(calls.kind, kindFatta), isNull(calls.deletedAt), isNull(calls.outcome))).orderBy(asc(calls.scheduledAt)).get()
    : undefined;
  const tentativo = TENTATIVI.includes(input.esito);
  const attemptNo = tentativo ? lead.attemptCount + 1 : null;
  const callId = input.call ? crypto.randomUUID() : null;
  const corpo = [ETICHETTE[input.esito], input.note].filter(Boolean).join(". ");

  const patch: Partial<Lead> = {
    stageId: stage.id,
    nextAction: stage.kind === "open" ? input.nextAction : null,
    nextActionAt: stage.kind === "open" ? input.nextActionAt : null,
    attemptCount: attemptNo ?? lead.attemptCount,
    lostReason: input.lostReason ?? lead.lostReason,
    // Prima risposta vera: un tentativo a vuoto non conta.
    firstResponseAt: lead.firstResponseAt ?? (tentativo ? null : now),
    pausedUntil: cambiaFase ? null : lead.pausedUntil,
    updatedAt: now,
    ...(cambiaFase ? { stageChangedAt: now } : {}),
  };

  const passi: BatchItem<"sqlite">[] = [
    db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "esito", body: corpo, authorId: userId, createdAt: now, outcome: input.esito, attemptNo, callId, requestId: input.requestId }),
    db.update(leads).set(patch).where(eq(leads.id, leadId)),
    db.insert(auditLog).values({ id: crypto.randomUUID(), userId, entity: "lead", entityId: leadId, action: "esito", changes: JSON.stringify({ esito: input.esito, stageId: stage.id }), createdAt: now }),
  ];
  if (cambiaFase) {
    const da = await getStage(db, lead.stageId);
    passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "cambio_fase", body: `Da "${da.label}" a "${stage.label}"`, authorId: userId, createdAt: now }));
  }
  if (callAperta) passi.push(db.update(calls).set({ outcome: "fatta", outcomeAt: now, updatedAt: now }).where(eq(calls.id, callAperta.id)));
  if (input.call && callId) {
    passi.push(db.insert(calls).values({ id: callId, leadId, kind: input.call.kind, scheduledAt: input.call.scheduledAt, meetLink: input.call.meetLink, createdBy: userId, createdAt: now, updatedAt: now }));
  }
  try {
    await db.batch(passi as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  } catch (err) {
    // Due richieste uguali in parallelo: la seconda trova il requestId già scritto.
    if (String(err).includes("UNIQUE") && (await giaFatto(db, input.requestId))) return { lead: await getLead(db, leadId), duplicato: true, callId: null };
    throw err;
  }
  return { lead: await getLead(db, leadId), duplicato: false, callId };
}

// Modelli il cui invio vale come tentativo della sequenza.
const MODELLI_TENTATIVO = ["non_ti_ho_trovato", "ti_ho_cercato"];

export async function registraContatto(
  db: Db,
  leadId: string,
  input: { canale: "chiamata" | "whatsapp" | "email"; modello?: string },
  userId: string,
  now: number,
): Promise<void> {
  const lead = await getLead(db, leadId);
  const modello = input.modello ? await db.select().from(messageTemplates).where(eq(messageTemplates.id, input.modello)).get() : undefined;
  const dove = input.canale === "chiamata" ? null : input.canale === "whatsapp" ? "in WhatsApp" : "nell'email";
  const body = dove ? `Messaggio aperto ${dove}${modello ? ` (modello ${modello.title})` : ""}` : "Chiamata avviata";
  const tentativo = !!modello?.key && MODELLI_TENTATIVO.includes(modello.key);
  const attemptNo = tentativo ? lead.attemptCount + 1 : null;
  await db.batch([
    db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "contatto", body, authorId: userId, createdAt: now, attemptNo }),
    db.update(leads).set({ updatedAt: now, ...(tentativo ? { attemptCount: lead.attemptCount + 1 } : {}) }).where(eq(leads.id, leadId)),
  ]);
}
