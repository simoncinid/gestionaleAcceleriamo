import { and, desc, eq, exists, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, leads } from "../db/schema";

// Cestino dei lead (contratto blocco 1, sezione 7; modifica 9). Ci stanno solo i lead messi nel cestino da una persona
// (voce di storico "cestino"): i lead uniti a un altro o assorbiti da un doppione all'ingresso sono spariti, non cestinati.
export const GIORNI_CESTINO = 30;
const GIORNO = 86_400_000;

const cestinatoDaUnaPersona = (db: Db) =>
  exists(db.select({ id: activities.id }).from(activities).where(and(eq(activities.leadId, leads.id), eq(activities.type, "cestino"))));

export async function leggiCestino(db: Db, now: number) {
  const righe = await db
    .select({ id: leads.id, company: leads.company, contactName: leads.contactName, stageId: leads.stageId, deletedAt: leads.deletedAt })
    .from(leads)
    .where(and(isNotNull(leads.deletedAt), cestinatoDaUnaPersona(db)))
    .orderBy(desc(leads.deletedAt))
    .limit(500);
  // Giorni che restano prima che il giro programmato lo tolga per sempre (mai sotto zero).
  return righe.map((l) => ({ ...l, giorniRimasti: Math.max(0, GIORNI_CESTINO - Math.floor((now - (l.deletedAt ?? now)) / GIORNO)) }));
}
