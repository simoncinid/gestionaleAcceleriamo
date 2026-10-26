import { asc, eq } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { avvisa } from "../avvisi/service";
import { mandaConferma } from "../email/conferma";
import { leads, users } from "../db/schema";
import type { Env } from "../env";
import type { Impostazioni } from "../impostazioni/default";
import { leggiImpostazioni } from "../impostazioni/service";
import { calcolaPunteggio, datiPerPunteggio } from "./punteggio";
import { conScadenzaSla, leggiSla } from "./sla";

// Prima chiamata a chi dice Impostazioni (di base Diego, processo di vendita dal 19/10/2026); se è via o non c'è, all'altro (spec 6.3).
// Una query sola: gli utenti attivi sono pochi e la scelta si fa qui.
export async function assegnaResponsabile(db: Db, imp: Impostazioni, ora: number): Promise<string | null> {
  const { primaChiamata, presentazione, via } = imp.assegnazione;
  const attivi = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.active, true)).orderBy(asc(users.name)).all();
  // La pagina Impostazioni salva l'id dell'utente; il default usa il nome ("diego" vale anche per "diego.simoncini").
  const e = (chi: string) => (u: { id: string; username: string }) => u.id === chi || u.username === chi || u.username.startsWith(`${chi}.`);
  const assente = via.utente === primaChiamata && via.fino != null && via.fino > ora;
  const io = assente ? undefined : attivi.find(e(primaChiamata));
  // Via, disattivato o inesistente: prima chi fa la presentazione, poi gli altri attivi in ordine di nome.
  const sostituto = (presentazione !== primaChiamata ? attivi.find(e(presentazione)) : undefined) ?? attivi.find((u) => !e(primaChiamata)(u));
  return (io ?? sostituto)?.id ?? null;
}

// Catena del lead nuovo (spec 6.1): responsabile, punteggio, email di conferma.
export async function catenaLeadNuovo(env: Env, leadId: string, origine: "meta" | "foglio" | "manuale", now: number): Promise<void> {
  const db = getDb(env.DB);
  const lead = await db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return;
  const imp = await leggiImpostazioni(db);
  const ownerId = lead.ownerId ?? (await assegnaResponsabile(db, imp, now));
  const score = calcolaPunteggio(datiPerPunteggio(lead), imp.punteggio);
  // La prima chiamata scade con lo SLA in orario di apertura (stessa funzione di Oggi e della Scaletta).
  const { nextActionAt } = conScadenzaSla(lead, await leggiSla(db));
  await db.update(leads).set({ ownerId, score, nextActionAt }).where(eq(leads.id, leadId));
  // Spec 8: lead nuovo a tutti e due, solo dalle porte automatiche (un lead scritto a mano lo conosce chi lo scrive).
  // Prima della conferma: se l'email fallisce l'avviso c'è già. Una query sola (INSERT con gli utenti attivi).
  if (origine !== "manuale") {
    await avvisa(db, { evento: "lead_nuovo", entityId: leadId, titolo: `Lead nuovo: ${lead.company || "senza nome"}`, testo: lead.contactName ?? undefined, href: `/commerciale/lead/${leadId}` }, now);
  }
  // Passo 3 (spec 6.1): solo per i lead dalle porte automatiche. Se fallisce, lo riprende il giro.
  if (origine !== "manuale") await mandaConferma(env, leadId, now);
}
