import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notifications, users, type EventoAvviso } from "../db/schema";
import { EVENTI } from "./eventi";

// turno: distingue due volte dello stesso evento sullo stesso oggetto (la seconda pausa di un lead, la proposta
// che torna da seguire un altro giorno). Entra solo nella chiave: entity_id resta l'id, le chiusure non cambiano.
export type NuovoAvviso = { evento: EventoAvviso; entityId: string; turno?: string; titolo: string; testo?: string; href?: string; responsabile?: string | null };

export const chiaveAvviso = (evento: EventoAvviso, entityId: string, userId: string, turno?: string) =>
  turno ? `${evento}:${entityId}@${turno}:${userId}` : `${evento}:${entityId}:${userId}`;

// Solo il responsabile se l'evento è suo e il lead ne ha uno; altrimenti tutti gli utenti attivi.
const soloResponsabile = (a: Pick<NuovoAvviso, "evento" | "responsabile">) => (EVENTI[a.evento].chi === "responsabile" && a.responsabile ? a.responsabile : null);

export async function destinatari(db: Db, a: Pick<NuovoAvviso, "evento" | "responsabile">): Promise<string[]> {
  const r = soloResponsabile(a);
  if (r) return [r];
  return (await db.select({ id: users.id }).from(users).where(eq(users.active, true))).map((u) => u.id);
}

const ID_PER_BLOCCO = 90;

// Una riga per persona; la chiave unica rende innocuo ripetere lo stesso avviso a ogni giro.
// Una sola query in ogni caso: con "tutti" l'INSERT legge gli utenti attivi da sé (la catena del lead nuovo
// gira dentro il budget del foglio e di Meta, ogni query in meno conta).
export async function avvisa(db: Db, a: NuovoAvviso, now: number, chi?: string[]): Promise<number> {
  const ev = EVENTI[a.evento];
  const pushAt = ev.push ? null : now;
  const telegramAt = ev.telegram ? null : now;
  const persone = chi ?? (soloResponsabile(a) ? [soloResponsabile(a)!] : null);
  if (persone && !persone.length) return 0;
  // Una query per blocco: 9 parametri fissi più gli id, sotto il tetto di 100 di D1. Con l'elenco esplicito
  // l'INSERT legge le persone da users per id (90 per blocco), quindi resta una query sola per ogni squadra reale.
  const blocchi = persone ? Array.from({ length: Math.ceil(persone.length / ID_PER_BLOCCO) }, (_, i) => persone.slice(i * ID_PER_BLOCCO, (i + 1) * ID_PER_BLOCCO)) : [null];
  let creati = 0;
  for (const ids of blocchi) {
    const filtro = ids ? sql`u.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})` : sql`u.active = 1`;
    const r = await db.all<{ id: string }>(sql`INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, testo, href, created_at, push_at, telegram_at)
      SELECT lower(hex(randomblob(16))), ${a.turno ? `${a.evento}:${a.entityId}@${a.turno}:` : `${a.evento}:${a.entityId}:`} || u.id, u.id, ${a.evento}, ${a.entityId}, ${a.titolo}, ${a.testo ?? null}, ${a.href ?? null}, ${now}, ${pushAt}, ${telegramAt}
      FROM users u WHERE ${filtro}
      ON CONFLICT (chiave) DO NOTHING RETURNING id`);
    creati += r.length;
  }
  return creati;
}

export async function chiudiAvvisi(db: Db, eventi: EventoAvviso[], entityId: string, now: number) {
  await db.update(notifications).set({ closedAt: now })
    .where(and(inArray(notifications.evento, eventi), eq(notifications.entityId, entityId), isNull(notifications.closedAt)));
}
