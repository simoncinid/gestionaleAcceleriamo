import { and, asc, eq, ne } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { leads, users } from "../db/schema";
import type { Env } from "../env";
import type { Impostazioni } from "../impostazioni/default";
import { leggiImpostazioni } from "../impostazioni/service";
import { calcolaPunteggio, datiPerPunteggio } from "./punteggio";

// Prima chiamata a chi dice Impostazioni; se è via, all'altro (spec 6.3, Assegnazione).
export async function assegnaResponsabile(db: Db, imp: Impostazioni, ora: number): Promise<string | null> {
  const { primaChiamata, presentazione, via } = imp.assegnazione;
  const attivo = (username: string) => db.select({ id: users.id }).from(users).where(and(eq(users.active, true), eq(users.username, username))).get();
  const assente = via.utente === primaChiamata && via.fino != null && via.fino > ora;
  if (!assente) return (await attivo(primaChiamata))?.id ?? null;
  // Prima chi fa la presentazione, poi gli altri attivi in ordine di nome: scelta sempre uguale.
  if (presentazione !== primaChiamata) {
    const p = await attivo(presentazione);
    if (p) return p.id;
  }
  const altro = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), ne(users.username, primaChiamata))).orderBy(asc(users.name)).get();
  return altro?.id ?? null;
}

// Catena del lead nuovo (spec 6.1). Passi 1 e 2; il 3 arriva nel Task 15.
export async function catenaLeadNuovo(env: Env, leadId: string, _origine: "meta" | "foglio" | "manuale", now: number): Promise<void> {
  const db = getDb(env.DB);
  const lead = await db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return;
  const imp = await leggiImpostazioni(db);
  const ownerId = lead.ownerId ?? (await assegnaResponsabile(db, imp, now));
  const score = calcolaPunteggio(datiPerPunteggio(lead), imp.punteggio);
  await db.update(leads).set({ ownerId, score }).where(eq(leads.id, leadId));
}
