import { linkHttp } from "./validation";
import { assertCallFutura } from "../calls/service";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Db } from "../db/client";
import { activities, auditLog, CALL_KINDS, calls, leads, messageTemplates, type CallKind, type Lead } from "../db/schema";
import { callPerFase } from "../regole/fasi-call";
import { ESITI, type Esito } from "../regole/motore";
import { assertChiusura, getLead, getStage } from "./service";
import { contestoRegole } from "../impostazioni/service";
import { FASE } from "../processo/processo";
import { transizione } from "../processo/transizione";
import { passiProposta } from "../regole/applica";

export const esitoSchema = z
  .object({
    requestId: z.string().uuid(),
    esito: z.enum(ESITI),
    // Fase, azione e scadenza le calcola il server con la transizione (blocco 1, modifica 12): accettati, non usati.
    stageId: z.string().min(1).optional(),
    nextAction: z.string().trim().max(300).nullish(),
    nextActionAt: z.number().int().nullish(),
    // Giorno detto dal cliente per "richiamare": vince sulla scadenza di default.
    data: z.number().int().nullish(),
    // Stringa libera: i motivi validi stanno in Impostazioni e si controllano qui sotto.
    lostReason: z.string().min(1).max(40).nullish(),
    // Per andare in 80: testo per "altro", giorno di ricontatto per "non_ora" (blocco 1, modifica 7).
    lostNote: z.string().trim().max(500).nullish(),
    recontactAt: z.number().int().nullish(),
    note: z.string().trim().max(4000).optional(),
    call: z
      .object({ kind: z.enum(CALL_KINDS), scheduledAt: z.number().int(), meetLink: linkHttp("Link Meet non valido").nullable() })
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
  non_interessato: "Non interessato",
  fuori_target: "Non profilato",
  conoscenza_fissata: "Conoscenza fissata",
  conoscenza_fatta: "Conoscenza fatta",
  offerta_pronta: "Offerta pronta",
  offerta_fissata: "Offerta fissata",
  offerta_presentata: "Offerta presentata",
  analisi_fissata: "Analisi fissata",
  analisi_fatta: "Analisi fatta",
  progetto_pronto: "Progetto pronto",
  progetto_fissato: "Progetto fissato",
  progetto_presentato: "Progetto presentato",
};
// Gli esiti che chiudono la call in programma di quel tipo (resta una sola strada per dire "fatta").
const CALL_FATTA: Partial<Record<Esito, CallKind>> = {
  conoscenza_fatta: "conoscenza", offerta_presentata: "offerta", analisi_fatta: "analisi", progetto_presentato: "progetto",
};
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

// Esiti validi per fase (modifica 25): in 10 e 20 solo le telefonate, poi una riga per ogni passo del percorso.
// "Non interessato" e "Non profilato" valgono in tutte le fasi aperte; 70, 80, 90 nessuno. Copia unica: l'interfaccia la importa da qui.
const CHIUSURE: Esito[] = ["non_interessato", "fuori_target"];
const TELEFONATE: Esito[] = ["non_risponde", "occupato", "richiamare", "risposto", "conoscenza_fissata"];
const DOPO_CALL: Esito[] = ["richiamare", "non_risponde", "occupato"];
export const ESITI_PER_FASE: Record<string, Esito[]> = {
  [FASE.nuovo]: [...TELEFONATE, ...CHIUSURE],
  [FASE.richiamare]: [...TELEFONATE, ...CHIUSURE],
  [FASE.conoscenza]: ["conoscenza_fatta", "offerta_fissata", ...DOPO_CALL, ...CHIUSURE],
  [FASE.attesaOfferta]: ["offerta_pronta", "offerta_fissata", ...DOPO_CALL, "risposto", ...CHIUSURE],
  [FASE.offerta]: ["offerta_presentata", "analisi_fissata", ...DOPO_CALL, ...CHIUSURE],
  [FASE.analisi]: ["analisi_fatta", "progetto_fissato", ...DOPO_CALL, ...CHIUSURE],
  [FASE.attesaProgetto]: ["progetto_pronto", "progetto_fissato", ...DOPO_CALL, "risposto", ...CHIUSURE],
  [FASE.progetto]: ["progetto_presentato", ...DOPO_CALL, ...CHIUSURE],
  [FASE.decisione]: ["risposto", "richiamare", "non_risponde", "occupato", "progetto_fissato", ...CHIUSURE],
};

// Un solo PATCH, una sola transazione D1 (db.batch): attività, fase, prossima azione, call.
// D1 non ha transazioni interattive: le letture stanno prima, le scritture tutte nel batch (tutto o niente).
// Fase, azione e scadenza le decide la transizione (blocco 1, modifica 12); la persona dice solo cosa è successo.
export async function salvaEsito(db: Db, leadId: string, input: EsitoInput, userId: string, now: number): Promise<{ lead: Lead; duplicato: boolean; callId: string | null }> {
  if (await giaFatto(db, input.requestId)) return { lead: await getLead(db, leadId), duplicato: true, callId: null };
  const lead = await getLead(db, leadId);
  if (!(ESITI_PER_FASE[lead.stageId] ?? []).includes(input.esito)) throw new HTTPException(422, { message: "Questo esito non vale in questa fase" });
  if (input.call) assertCallFutura(input.call.scheduledAt, now);
  const ctx = await contestoRegole(db, now);
  const p = transizione(
    { stageId: lead.stageId, attemptCount: lead.attemptCount, primoTentativoAt: await primoTentativoAt(db, leadId), noShow: lead.noShow, pausedUntil: lead.pausedUntil, stageChangedAt: lead.stageChangedAt },
    { tipo: "esito", esito: input.esito, call: input.call ? { scheduledAt: input.call.scheduledAt } : undefined },
    ctx,
  );
  // "Richiamare" con il giorno detto dal cliente: quel giorno vince sulla scadenza di default.
  if (input.esito === "richiamare" && input.data != null) p.nextActionAt = input.data;
  const stage = await getStage(db, p.stageId ?? lead.stageId);
  const cambiaFase = stage.id !== lead.stageId;
  // Verso 80 il motivo lo sceglie la persona, salvo i motivi automatici (mai risposto, no-show).
  const versoPerso = cambiaFase && stage.id === FASE.perso && p.lostReason === undefined;
  const motivo = versoPerso ? await assertChiusura(db, input, now) : null;
  if (versoPerso) p.lostReason = input.lostReason!;
  if (versoPerso && input.lostReason === "non_ora") p.pausedUntil = input.recontactAt;
  // Nelle fasi che esistono solo con una call fissata si entra con la call nell'esito
  // oppure con una call di quel tipo già in programma.
  const kindCall = cambiaFase ? callPerFase(stage.id) : null;
  if (kindCall && input.call?.kind !== kindCall) {
    const esistente = await db.select({ id: calls.id, scheduledAt: calls.scheduledAt }).from(calls)
      .where(and(eq(calls.leadId, leadId), eq(calls.kind, kindCall), isNull(calls.deletedAt), isNull(calls.outcome), gte(calls.scheduledAt, now))).get();
    if (!esistente) throw new HTTPException(422, { message: "Per questa fase serve la call: scegli giorno e ora" });
    if (p.nextActionAt == null) p.nextActionAt = esistente.scheduledAt;
  }

  const kindFatta = CALL_FATTA[input.esito];
  const callAperta = kindFatta
    ? await db.select({ id: calls.id }).from(calls)
      .where(and(eq(calls.leadId, leadId), eq(calls.kind, kindFatta), isNull(calls.deletedAt), isNull(calls.outcome))).orderBy(asc(calls.scheduledAt)).get()
    : undefined;
  const tentativo = TENTATIVI.includes(input.esito);
  const attemptNo = tentativo ? lead.attemptCount + 1 : null;
  const callId = input.call ? crypto.randomUUID() : null;
  // Collaudo 26/10, voce 3: il motivo del lead perso si legge anche nello storico.
  const corpo = [ETICHETTE[input.esito], motivo, input.note].filter(Boolean).join(". ");

  // Fase, responsabile, azione e storico del cambio di fase: la stessa strada di ogni proposta del motore.
  const passi: BatchItem<"sqlite">[] = await passiProposta(db, leadId, p, userId, now);
  passi.unshift(db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "esito", body: corpo, authorId: userId, createdAt: now, outcome: input.esito, attemptNo, callId, requestId: input.requestId }));
  passi.push(db.update(leads).set({
    // Prima risposta vera: un tentativo a vuoto non conta.
    firstResponseAt: lead.firstResponseAt ?? (tentativo ? null : now),
    // Fasi chiuse: nessuna azione. La pausa vale solo nella fase in cui è nata.
    ...(stage.kind === "open" ? {} : { nextAction: null, nextActionAt: null }),
    ...(p.pausedUntil === undefined && cambiaFase ? { pausedUntil: null } : {}),
  }).where(eq(leads.id, leadId)));
  passi.push(db.insert(auditLog).values({ id: crypto.randomUUID(), userId, entity: "lead", entityId: leadId, action: "esito", changes: JSON.stringify({ esito: input.esito, stageId: stage.id }), createdAt: now }));
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
