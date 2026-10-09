import type { Db } from "../db/client";
import { auditLog } from "../db/schema";

export async function audit(db: Db, userId: string | null, entity: string, entityId: string, action: string, changes?: unknown, now = Date.now()) {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    entity,
    entityId,
    action,
    changes: changes === undefined ? null : JSON.stringify(changes),
    createdAt: now,
  });
}
