import { and, desc, eq, exists, inArray, isNotNull, lt } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, aiJobs, callAnalyses, calls, clients, companyProfiles, documents, documentVersions, leads, leadVisti, mailLette, proposals } from "../db/schema";
import { chiaviDelLead } from "./documenti";
import { audit } from "../lib/audit";

// Cestino dei lead (contratto blocco 1, sezione 7; modifica 9). Ci stanno solo i lead messi nel cestino da una persona
// (voce di storico "cestino"): i lead uniti a un altro o assorbiti da un doppione all'ingresso sono spariti, non cestinati.
export const GIORNI_CESTINO = 30;
const GIORNO = 86_400_000;
// Lead tolti per sempre in un giro programmato: circa 12 query l'uno, restiamo lontani dalle 50 di una invocazione.
const PER_GIRO = 3;

const nelCestino = (db: Db) =>
  and(
    isNotNull(leads.deletedAt),
    exists(db.select({ id: activities.id }).from(activities).where(and(eq(activities.leadId, leads.id), eq(activities.type, "cestino")))),
  );

export async function leggiCestino(db: Db, now: number) {
  const righe = await db
    .select({ id: leads.id, company: leads.company, contactName: leads.contactName, stageId: leads.stageId, deletedAt: leads.deletedAt })
    .from(leads)
    .where(nelCestino(db))
    .orderBy(desc(leads.deletedAt))
    .limit(500);
  // Giorni che restano prima che il giro programmato lo tolga per sempre (mai sotto zero).
  return righe.map((l) => ({ ...l, giorniRimasti: Math.max(0, GIORNI_CESTINO - Math.floor((now - (l.deletedAt ?? now)) / GIORNO)) }));
}

// "Elimina per sempre": solo un lead che è nel cestino e non è diventato cliente. Via il lead e tutto ciò che è suo;
// le proposte restano (hanno un numero) senza il legame, i doppioni che puntavano a lui perdono il puntatore.
export async function eliminaPerSempre(db: Db, id: string, actorId: string | null, now = Date.now(), bucket?: R2Bucket) {
  const lead = await db.select({ id: leads.id, company: leads.company, deletedAt: leads.deletedAt }).from(leads).where(eq(leads.id, id)).get();
  if (!lead) throw new HTTPException(404, { message: "Lead non trovato" });
  const cestinato = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), nelCestino(db))).get();
  if (!cestinato) throw new HTTPException(409, { message: "Si elimina per sempre solo un lead che è nel cestino" });
  const cliente = await db.select({ id: clients.id }).from(clients).where(eq(clients.originLeadId, id)).get();
  if (cliente) throw new HTTPException(409, { message: "È diventato un cliente: si può ripristinare, non eliminare per sempre" });
  // Documenti caricati: via anche le versioni e i file su R2 (dopo il database, un file orfano costa meno di un buco).
  const { docIds, chiavi } = await chiaviDelLead(db, id);
  await db.batch([
    db.delete(activities).where(eq(activities.leadId, id)),
    ...(docIds.length ? [db.delete(documentVersions).where(inArray(documentVersions.documentId, docIds))] : []),
    db.delete(leadVisti).where(eq(leadVisti.leadId, id)),
    db.delete(documents).where(eq(documents.leadId, id)),
    db.delete(callAnalyses).where(eq(callAnalyses.leadId, id)),
    db.delete(calls).where(eq(calls.leadId, id)),
    db.delete(companyProfiles).where(eq(companyProfiles.leadId, id)),
    db.delete(aiJobs).where(eq(aiJobs.leadId, id)),
    db.update(proposals).set({ leadId: null }).where(eq(proposals.leadId, id)),
    db.update(mailLette).set({ leadId: null }).where(eq(mailLette.leadId, id)),
    db.update(leads).set({ duplicateOfId: null }).where(eq(leads.duplicateOfId, id)),
    db.delete(leads).where(eq(leads.id, id)),
  ]);
  if (bucket) {
    for (let i = 0; i < chiavi.length; i += 1000) await bucket.delete(chiavi.slice(i, i + 1000)).catch((e) => console.error("documenti_r2_elimina", e));
    // Pulizia della cartella del lead: niente file rimasti su R2 se una cancellazione sopra è fallita (Riccardo).
    const resto = await bucket.list({ prefix: `lead/${id}/` }).catch(() => null);
    if (resto?.objects.length) await bucket.delete(resto.objects.map((o) => o.key)).catch((e) => console.error("documenti_r2_elimina", e));
  }
  await audit(db, actorId, "lead", id, `elimina per sempre: ${lead.company}`, undefined, now);
}

// Giro programmato: toglie per sempre i lead nel cestino da più di 30 giorni (pochi per volta). Restituisce quanti.
// Va chiamato dal cron (worker/cron.ts, fuori dalla corsia D): vedi il registro della modifica 9.
export async function togliScaduti(db: Db, now: number, bucket?: R2Bucket) {
  const scaduti = await db.select({ id: leads.id }).from(leads)
    .where(and(nelCestino(db), lt(leads.deletedAt, now - GIORNI_CESTINO * GIORNO)))
    .orderBy(leads.deletedAt).limit(PER_GIRO);
  let tolti = 0;
  for (const l of scaduti) {
    try { await eliminaPerSempre(db, l.id, null, now, bucket); tolti++; }
    catch (err) { if (!(err instanceof HTTPException)) throw err; } // un cliente resta nel cestino: niente da fare
  }
  return tolti;
}
