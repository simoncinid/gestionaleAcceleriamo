import { eq, inArray } from "drizzle-orm";
import { leggiImpostazioni } from "../impostazioni/service";
import { ruoloDellaFase } from "../processo/processo";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, leads, stages, users } from "../db/schema";
import type { Proposta } from "./motore";

// Responsabile di default della fase (contratto blocco 1, sezione 7): chi fa la prima chiamata da 10 a 30,
// chi fa la presentazione da 40 a 70, letti da Impostazioni > Assegnazione. Un responsabile scelto a mano resta.
// undefined = non toccare (scelto a mano, fase senza ruolo, persona non trovata o disattivata).
export async function responsabileDellaFase(db: Db, lead: { ownerId: string | null; ownerManual: boolean }, stageId: string): Promise<string | undefined> {
  const ruolo = ruoloDellaFase(stageId);
  if (lead.ownerManual || !ruolo) return undefined;
  const chi = (await leggiImpostazioni(db)).assegnazione[ruolo];
  // Impostazioni salva l'id dell'utente; il default usa il nome ("diego" vale anche per "diego.simoncini").
  const attivi = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.active, true));
  return attivi.find((u) => u.id === chi || u.username === chi || u.username.startsWith(`${chi}.`))?.id;
}

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
    const owner = await responsabileDellaFase(db, lead, p.stageId);
    if (owner !== undefined) set.ownerId = owner;
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
  if (p.noShow !== undefined) set.noShow = p.noShow;
  passi.unshift(db.update(leads).set(set).where(eq(leads.id, leadId)));
  return passi;
}
