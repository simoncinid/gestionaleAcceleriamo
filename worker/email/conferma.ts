import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { activities, leads, messageTemplates } from "../db/schema";
import type { Env } from "../env";
import { leggiImpostazioni } from "../impostazioni/service";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { partiRoma } from "../lib/roma";
import { CHIAVE_MANCANTE, conPiede, inviaEmail } from "./resend";

// Il primo invio più tre ritentativi (spec 6.2).
export const MAX_TENTATIVI_CONFERMA = 4;
const PORTE = ["meta", "foglio_andrea"] as const;
const emailValida = (v: string | null) => !!v && z.string().email().safeParse(v.trim()).success;

const riempi = (testo: string, valori: Record<string, string>) =>
  testo.replace(/\{(\w+)\}/g, (_, k: string) => valori[k] ?? "").replace(/[ \t]+,/g, ",");

const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = (testo: string) => testo.split(/\n{2,}/).map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("\n");

// Per la scheda: tutti i tentativi spesi e l'email non è partita.
export const confermaNonPartita = (l: { confirmationSentAt: number | null; confirmationAttempts: number }) =>
  l.confirmationSentAt == null && l.confirmationAttempts >= MAX_TENTATIVI_CONFERMA;

async function daMandare(db: Db, leadId: string) {
  const l = await db.select().from(leads).where(and(eq(leads.id, leadId), isNull(leads.deletedAt))).get();
  if (!l || l.confirmationSentAt != null || l.confirmationAttempts >= MAX_TENTATIVI_CONFERMA) return null;
  if (!(PORTE as readonly string[]).includes(l.source) || !emailValida(l.email)) return null;
  if (l.duplicateOfId) {
    const orig = await db.select({ inviata: leads.confirmationSentAt }).from(leads).where(eq(leads.id, l.duplicateOfId)).get();
    if (orig?.inviata != null) return null;
  }
  return l;
}

// Spec 6.2: una sola email per lead, solo dalle due porte automatiche, a qualsiasi ora.
export async function mandaConferma(env: Env, leadId: string, now: number): Promise<"mandata" | "saltata" | "errore"> {
  const db = getDb(env.DB);
  const imp = await leggiImpostazioni(db);
  if (!imp.conferma.attiva) return "saltata";
  const l = await daMandare(db, leadId);
  if (!l) return "saltata";
  const modello = await db.select().from(messageTemplates).where(eq(messageTemplates.key, "conferma")).get();
  if (!modello) return "saltata";
  const valori = { referente: l.contactName?.trim().split(/\s+/)[0] ?? "", azienda: l.company };
  // La riga legale chiude sempre l'email, anche se il piede delle Impostazioni viene svuotato.
  const corpo = conPiede([riempi(modello.body, valori), imp.conferma.piede.trim()].filter(Boolean).join("\n\n"));
  const esito = await inviaEmail(env, {
    from: imp.conferma.mittente, to: l.email!.trim(), replyTo: imp.conferma.rispondiA,
    subject: riempi(modello.subject ?? "Abbiamo ricevuto la tua richiesta", valori), text: corpo, html: html(corpo), chiave: `conferma-${l.id}`,
  });
  if (esito.ok) {
    const { ore, minuti } = partiRoma(now);
    await db.batch([
      db.update(leads).set({ confirmationSentAt: now, confirmationError: null, confirmationAttempts: l.confirmationAttempts + 1 }).where(eq(leads.id, l.id)),
      db.insert(activities).values({ id: crypto.randomUUID(), leadId: l.id, type: "email_auto", body: `Email di conferma mandata alle ${ore}:${String(minuti).padStart(2, "0")}`, authorId: null, createdAt: now }),
    ]);
    await segnaOk(db, "resend", now);
    return "mandata";
  }
  // Resend non ancora collegato: nessun errore per chi usa l'app, nessun tentativo speso; l'email resta in coda e parte col primo giro dopo la chiave.
  if (esito.errore === CHIAVE_MANCANTE) {
    await db.update(leads).set({ confirmationError: CHIAVE_MANCANTE }).where(eq(leads.id, l.id));
    return "saltata";
  }
  const tentativi = esito.ritentabile ? l.confirmationAttempts + 1 : MAX_TENTATIVI_CONFERMA;
  await db.update(leads).set({ confirmationAttempts: tentativi, confirmationError: esito.errore.slice(0, 300) }).where(eq(leads.id, l.id));
  if (tentativi >= MAX_TENTATIVI_CONFERMA) await segnaErrore(db, "resend", `Email di conferma non partita (${l.company}): ${esito.errore}`, now);
  return "errore";
}

// Giro ogni 5 minuti: al massimo `limite` email ritentate (spec 16.1). Senza chiave non si prova nemmeno.
export async function ritentaConferme(env: Env, now: number, limite = 5): Promise<number> {
  if (!env.RESEND_API_KEY) return 0;
  const db = getDb(env.DB);
  const righe = await db.select({ id: leads.id }).from(leads)
    .where(and(isNull(leads.confirmationSentAt), isNotNull(leads.confirmationError), lt(leads.confirmationAttempts, MAX_TENTATIVI_CONFERMA), inArray(leads.source, [...PORTE]), isNull(leads.deletedAt)))
    .limit(limite);
  let mandate = 0;
  for (const r of righe) if ((await mandaConferma(env, r.id, now)) === "mandata") mandate++;
  return mandate;
}
