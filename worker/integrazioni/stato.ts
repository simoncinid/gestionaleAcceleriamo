import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { integrationStatus } from "../db/schema";

// Stato delle integrazioni per Impostazioni > Integrazioni. Chiavi: resend, foglio, aggancio, meta.
export async function segnaOk(db: Db, key: string, now: number) {
  await db.insert(integrationStatus).values({ key, ok: true, lastOkAt: now })
    .onConflictDoUpdate({ target: integrationStatus.key, set: { ok: true, lastOkAt: now } });
}

export async function segnaErrore(db: Db, key: string, errore: string, now: number) {
  const errorId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  console.error("integrazione", key, errorId, errore);
  await db.insert(integrationStatus).values({ key, ok: false, lastErrorAt: now, lastError: errore.slice(0, 500), errorId })
    .onConflictDoUpdate({ target: integrationStatus.key, set: { ok: false, lastErrorAt: now, lastError: sql`excluded.last_error`, errorId: sql`excluded.error_id` } });
}
