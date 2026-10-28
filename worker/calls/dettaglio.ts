import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { clients } from "../db/schema";
import type { RigaContatto } from "../leads/collegamenti-tipi";
import { unaCall, type CallAgenda } from "./service";

// GET /api/calls/:id (contratto blocco 1, modifica 13): la call con la riga del contatto (lead e, se c'è, cliente).
export async function dettaglioCall(db: Db, id: string): Promise<{ call: CallAgenda; contatto: RigaContatto }> {
  const call = await unaCall(db, id);
  const cliente = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.originLeadId, call.leadId), isNull(clients.deletedAt))).get();
  return { call, contatto: { azienda: call.company, leadId: call.leadId, clienteId: cliente?.id ?? null } };
}
