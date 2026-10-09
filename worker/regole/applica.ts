import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, leads, stages } from "../db/schema";
import type { Proposta } from "./motore";

// Trasforma la proposta del motore in scritture da mettere in un db.batch insieme a quelle di chi chiama
// (tutto o niente). Si usa solo su un'azione esplicita della persona. nextAction null = non toccare.
export async function passiProposta(db: Db, leadId: string, p: Proposta, actorId: string | null, now: number): Promise<BatchItem<"sqlite">[]> {
  const lead = await db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new HTTPException(404, { message: "Lead non trovato" });
  const set: Partial<typeof leads.$inferInsert> = { updatedAt: now };
  const passi: BatchItem<"sqlite">[] = [];
  if (p.stageId && p.stageId !== lead.stageId) {
    const nomi = await db.select({ id: stages.id, label: stages.label }).from(stages).where(inArray(stages.id, [lead.stageId, p.stageId]));
    const nome = (id: string) => nomi.find((s) => s.id === id)?.label ?? id;
    set.stageId = p.stageId;
    set.stageChangedAt = now;
    passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "cambio_fase", body: `Da "${nome(lead.stageId)}" a "${nome(p.stageId)}"`, authorId: actorId, createdAt: now }));
  }
  if (p.nextAction != null) {
    set.nextAction = p.nextAction;
    set.nextActionAt = p.nextActionAt;
  }
  if (p.attemptCount !== undefined) set.attemptCount = p.attemptCount;
  if (p.sequenceStep !== undefined) set.sequenceStep = p.sequenceStep;
  if (p.pausedUntil !== undefined) set.pausedUntil = p.pausedUntil;
  if (p.lostReason !== undefined) set.lostReason = p.lostReason;
  passi.unshift(db.update(leads).set(set).where(eq(leads.id, leadId)));
  return passi;
}
