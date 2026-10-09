import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notifications, users, type EventoAvviso } from "../db/schema";
import { EVENTI } from "./eventi";

export type NuovoAvviso = { evento: EventoAvviso; entityId: string; titolo: string; testo?: string; href?: string; responsabile?: string | null };

export const chiaveAvviso = (evento: EventoAvviso, entityId: string, userId: string) => `${evento}:${entityId}:${userId}`;

// Solo il responsabile se l'evento è suo e il lead ne ha uno; altrimenti tutti gli utenti attivi.
const soloResponsabile = (a: Pick<NuovoAvviso, "evento" | "responsabile">) => (EVENTI[a.evento].chi === "responsabile" && a.responsabile ? a.responsabile : null);

export async function destinatari(db: Db, a: Pick<NuovoAvviso, "evento" | "responsabile">): Promise<string[]> {
  const r = soloResponsabile(a);
  if (r) return [r];
  return (await db.select({ id: users.id }).from(users).where(eq(users.active, true))).map((u) => u.id);
}

// Una riga per persona; la chiave unica rende innocuo ripetere lo stesso avviso a ogni giro.
// Una sola query in ogni caso: con "tutti" l'INSERT legge gli utenti attivi da sé (la catena del lead nuovo
// gira dentro il budget del foglio e di Meta, ogni query in meno conta).
export async function avvisa(db: Db, a: NuovoAvviso, now: number, chi?: string[]): Promise<number> {
  const ev = EVENTI[a.evento];
  const pushAt = ev.push ? null : now;
  const telegramAt = ev.telegram ? null : now;
  const persone = chi ?? (soloResponsabile(a) ? [soloResponsabile(a)!] : null);
  if (persone) {
    if (!persone.length) return 0;
    const righe = persone.map((userId) => ({
      id: crypto.randomUUID(),
      chiave: chiaveAvviso(a.evento, a.entityId, userId),
      userId,
      evento: a.evento,
      entityId: a.entityId,
      titolo: a.titolo,
      testo: a.testo ?? null,
      href: a.href ?? null,
      createdAt: now,
      pushAt,
      telegramAt,
    }));
    const r = await db.insert(notifications).values(righe).onConflictDoNothing({ target: notifications.chiave }).returning({ id: notifications.id });
    return r.length;
  }
  const r = await db.all<{ id: string }>(sql`INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, testo, href, created_at, push_at, telegram_at)
    SELECT lower(hex(randomblob(16))), ${`${a.evento}:${a.entityId}:`} || u.id, u.id, ${a.evento}, ${a.entityId}, ${a.titolo}, ${a.testo ?? null}, ${a.href ?? null}, ${now}, ${pushAt}, ${telegramAt}
    FROM users u WHERE u.active = 1
    ON CONFLICT (chiave) DO NOTHING RETURNING id`);
  return r.length;
}

export async function chiudiAvvisi(db: Db, eventi: EventoAvviso[], entityId: string, now: number) {
  await db.update(notifications).set({ closedAt: now })
    .where(and(inArray(notifications.evento, eventi), eq(notifications.entityId, entityId), isNull(notifications.closedAt)));
}
