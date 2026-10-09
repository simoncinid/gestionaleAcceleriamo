import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Db } from "../db/client";
import { activities, calls, leads, proposals } from "../db/schema";
import type { Env } from "../env";
import { CHIAVE_MANCANTE, base64Utf8, indirizzoDi, inviaEmail } from "../email/resend";
import { contestoRegole, leggiImpostazioni } from "../impostazioni/service";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { partiRoma } from "../lib/roma";
import { passiProposta } from "../regole/applica";
import { propostaEvento } from "../regole/motore";
import { creaIcs } from "./ics";

const link = z.string().trim().url("Link Meet non valido").max(500).nullable();
export const callNuovaSchema = z.object({ kind: z.enum(["conoscenza", "presentazione"]), scheduledAt: z.number().int(), meetLink: link, invito: z.boolean().default(false) }).strict();
export const callPatchSchema = z.object({
  scheduledAt: z.number().int().optional(),
  meetLink: link.optional(),
  notes: z.string().max(20000).nullable().optional(),
  outcome: z.enum(["fatta", "saltata", "rimandata"]).nullable().optional(),
  presentazione: z.object({ scheduledAt: z.number().int(), meetLink: link }).strict().optional(),
}).strict();

export type CallAgenda = {
  id: string; leadId: string; company: string; contactName: string | null; phone: string | null; email: string | null;
  kind: "conoscenza" | "presentazione"; scheduledAt: number; meetLink: string | null; notes: string | null;
  outcome: "fatta" | "saltata" | "rimandata" | null; inviteSentAt: number | null;
};

const COLONNE = {
  id: calls.id, leadId: calls.leadId, company: leads.company, contactName: leads.contactName, phone: leads.phone, email: leads.email,
  kind: calls.kind, scheduledAt: calls.scheduledAt, meetLink: calls.meetLink, notes: calls.notes, outcome: calls.outcome, inviteSentAt: calls.inviteSentAt,
};

export const agenda = (db: Db, da: number, a: number): Promise<CallAgenda[]> =>
  db.select(COLONNE).from(calls).innerJoin(leads, eq(leads.id, calls.leadId))
    .where(and(isNull(calls.deletedAt), isNull(leads.deletedAt), gte(calls.scheduledAt, da), lt(calls.scheduledAt, a))).orderBy(calls.scheduledAt);

export const callDelLead = (db: Db, leadId: string): Promise<CallAgenda[]> =>
  db.select(COLONNE).from(calls).innerJoin(leads, eq(leads.id, calls.leadId)).where(and(eq(calls.leadId, leadId), isNull(calls.deletedAt))).orderBy(calls.scheduledAt);

export async function unaCall(db: Db, id: string): Promise<CallAgenda> {
  const [k] = await db.select(COLONNE).from(calls).innerJoin(leads, eq(leads.id, calls.leadId)).where(and(eq(calls.id, id), isNull(calls.deletedAt)));
  if (!k) throw new HTTPException(404, { message: "Call non trovata" });
  return k;
}

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
// Orari mostrati sempre sul fuso di Roma.
const quandoTesto = (ms: number) => {
  const p = partiRoma(ms);
  return `${GIORNI[p.settimana]} ${p.giorno}/${p.mese} alle ${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`;
};

// Il .ics è identico a ogni tentativo: DTSTAMP è la creazione della call, così la chiave di idempotenza di Resend vale davvero.
export async function icsDellaCall(db: Db, k: CallAgenda): Promise<string> {
  const [riga] = await db.select({ createdAt: calls.createdAt }).from(calls).where(eq(calls.id, k.id));
  const imp = await leggiImpostazioni(db);
  return creaIcs({
    uid: k.id, inizio: k.scheduledAt, titolo: `Call di ${k.kind} con Acceleriamo`, descrizione: k.meetLink ? `Link: ${k.meetLink}` : undefined, luogo: k.meetLink,
    ora: riga?.createdAt, organizer: indirizzoDi(imp.conferma.mittente), attendee: k.email,
  });
}

export const ERRORE_SENZA_EMAIL = "Manca l'email del referente";
export const ERRORE_NON_COLLEGATO = "Resend non collegato: l'invito non è partito";

export async function mandaInvito(env: Env, db: Db, id: string, actorId: string | null, now: number): Promise<{ ok: true } | { ok: false; errore: string }> {
  const k = await unaCall(db, id);
  if (!k.email) return { ok: false, errore: ERRORE_SENZA_EMAIL };
  const imp = await leggiImpostazioni(db);
  const nome = k.contactName?.trim().split(/\s+/)[0] ?? "";
  const r = await inviaEmail(env, {
    from: imp.conferma.mittente,
    to: k.email,
    replyTo: imp.conferma.rispondiA,
    subject: `Call con Acceleriamo, ${quandoTesto(k.scheduledAt)}`,
    // Il piede legale lo aggiunge inviaEmail in fondo a ogni email.
    text: [
      nome ? `Ciao ${nome},` : "Ciao,",
      `ti confermo la call di ${quandoTesto(k.scheduledAt)}.`,
      ...(k.meetLink ? [`Link: ${k.meetLink}`] : []),
      "Trovi l'invito in allegato, da aggiungere al calendario.",
      ...(imp.conferma.piede.trim() ? ["", imp.conferma.piede.trim()] : []),
    ].join("\n"),
    allegati: [{ filename: "invito.ics", content: base64Utf8(await icsDellaCall(db, k)) }],
    chiave: `invito-${k.id}-${k.scheduledAt}`,
  });
  if (!r.ok) {
    await segnaErrore(db, "resend", r.errore, now);
    return { ok: false, errore: r.errore === CHIAVE_MANCANTE ? ERRORE_NON_COLLEGATO : "Invito non partito: riprova tra poco" };
  }
  await segnaOk(db, "resend", now);
  await db.batch([
    db.update(calls).set({ inviteSentAt: now, updatedAt: now }).where(eq(calls.id, id)),
    db.insert(activities).values({ id: crypto.randomUUID(), leadId: k.leadId, type: "email_auto", body: `Invito mandato per la call di ${quandoTesto(k.scheduledAt)}`, authorId: actorId, createdAt: now, callId: id }),
  ]);
  return { ok: true };
}

// Fissare una call è un'azione esplicita: la proposta del motore (fase e prossima azione) si applica nello stesso batch.
export async function fissaCall(env: Env, db: Db, leadId: string, input: z.infer<typeof callNuovaSchema>, actorId: string, now: number) {
  const id = crypto.randomUUID();
  const ctx = await contestoRegole(db, now);
  const passi = await passiProposta(db, leadId, propostaEvento({ tipo: "call_fissata", kind: input.kind, scheduledAt: input.scheduledAt }, ctx), actorId, now);
  await db.batch([
    db.insert(calls).values({ id, leadId, kind: input.kind, scheduledAt: input.scheduledAt, meetLink: input.meetLink, createdBy: actorId, createdAt: now, updatedAt: now }),
    db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "call", body: `Call di ${input.kind} fissata per ${quandoTesto(input.scheduledAt)}`, authorId: actorId, createdAt: now, callId: id }),
    ...passi,
  ]);
  let invito: "mandato" | "non_mandato" | "non_richiesto" = "non_richiesto";
  let errore: string | undefined;
  if (input.invito) {
    const r = await mandaInvito(env, db, id, actorId, now);
    invito = r.ok ? "mandato" : "non_mandato";
    if (!r.ok) errore = r.errore;
  }
  return { call: await unaCall(db, id), invito, errore };
}

export async function aggiornaCall(db: Db, id: string, input: z.infer<typeof callPatchSchema>, actorId: string, now: number) {
  const k = await unaCall(db, id);
  const ctx = await contestoRegole(db, now);
  const passi: BatchItem<"sqlite">[] = [];
  const set: Partial<typeof calls.$inferInsert> = { updatedAt: now };
  if (input.scheduledAt !== undefined) set.scheduledAt = input.scheduledAt;
  if (input.meetLink !== undefined) set.meetLink = input.meetLink;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.outcome !== undefined && input.outcome !== k.outcome) {
    set.outcome = input.outcome;
    set.outcomeAt = input.outcome ? now : null;
    if (input.outcome === "fatta" && k.kind === "conoscenza") {
      const pres = input.presentazione;
      if (pres) {
        const nuova = crypto.randomUUID();
        passi.push(db.insert(calls).values({ id: nuova, leadId: k.leadId, kind: "presentazione", scheduledAt: pres.scheduledAt, meetLink: pres.meetLink, createdBy: actorId, createdAt: now, updatedAt: now }));
        passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId: k.leadId, type: "call", body: `Call di presentazione fissata per ${quandoTesto(pres.scheduledAt)}`, authorId: actorId, createdAt: now, callId: nuova }));
      }
      const p = propostaEvento({ tipo: "call_fatta", kind: "conoscenza", presentazioneAt: pres?.scheduledAt ?? null }, ctx);
      passi.push(...(await passiProposta(db, k.leadId, pres ? { ...p, nextAction: "Call di presentazione", nextActionAt: pres.scheduledAt } : p, actorId, now)));
    } else if (input.outcome === "fatta") {
      passi.push(...(await passiProposta(db, k.leadId, propostaEvento({ tipo: "call_fatta", kind: "presentazione" }, ctx), actorId, now)));
      passi.push(db.update(proposals).set({ status: "presentata", presentedAt: now, updatedAt: now })
        .where(and(eq(proposals.leadId, k.leadId), eq(proposals.status, "registrata"), isNull(proposals.deletedAt))));
    } else if (input.outcome === "saltata") {
      passi.push(...(await passiProposta(db, k.leadId, propostaEvento({ tipo: "call_saltata" }, ctx), actorId, now)));
    }
    const testo = { fatta: "fatta", saltata: "saltata", rimandata: "rimandata" }[input.outcome ?? "rimandata"];
    passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId: k.leadId, type: "call", body: `Call di ${k.kind} ${testo}`, authorId: actorId, createdAt: now, callId: id }));
  }
  // Rimandata con la nuova data: la call torna in programma e la prossima azione segue la data nuova.
  if (input.outcome === "rimandata" && input.scheduledAt !== undefined) {
    set.outcome = null;
    set.outcomeAt = null;
    passi.push(...(await passiProposta(db, k.leadId, propostaEvento({ tipo: "call_fissata", kind: k.kind, scheduledAt: input.scheduledAt }, ctx), actorId, now)));
  }
  await db.batch([db.update(calls).set(set).where(eq(calls.id, id)), ...passi]);
  return unaCall(db, id);
}
