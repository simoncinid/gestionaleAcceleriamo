import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, automations, calls, clients, fees, leads, proposals } from "../db/schema";
import type { Collegamenti } from "./collegamenti-tipi";

// Inviti di Google da confermare (attività "invito_proposta" della corsia A, outcome "da_confermare"):
// stanno qui perché il dettaglio del lead non porta l'esito delle attività.
export type InvitoDaConfermare = { id: string; body: string; createdAt: number };
export type CollegamentiScheda = Collegamenti & { inviti: InvitoDaConfermare[] };

// GET /api/leads/:id/collegamenti (contratto blocco 1, sezione 3): proposte, call, cliente e, dal cliente
// (clients.originLeadId), automazioni e canoni. Solo letture, niente campi nuovi.
export async function collegamentiDelLead(db: Db, leadId: string): Promise<CollegamentiScheda> {
  const lead = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), isNull(leads.deletedAt))).get();
  if (!lead) throw new HTTPException(404, { message: "Lead non trovato" });

  const [righeProposte, righeCall, cliente, inviti] = await Promise.all([
    db.select({ id: proposals.id, number: proposals.number, status: proposals.status, createdAt: proposals.createdAt, sentAt: proposals.sentAt, setupCents: proposals.setupCents, feeCents: proposals.feeCents })
      .from(proposals).where(and(eq(proposals.leadId, leadId), isNull(proposals.deletedAt))).orderBy(desc(proposals.createdAt)),
    db.select({ id: calls.id, kind: calls.kind, scheduledAt: calls.scheduledAt, outcome: calls.outcome })
      .from(calls).where(and(eq(calls.leadId, leadId), isNull(calls.deletedAt))).orderBy(desc(calls.scheduledAt)),
    db.select({ id: clients.id, name: clients.name, dal: clients.createdAt })
      .from(clients).where(and(eq(clients.originLeadId, leadId), isNull(clients.deletedAt))).get(),
    db.select({ id: activities.id, body: activities.body, createdAt: activities.createdAt, outcome: activities.outcome, type: activities.type })
      .from(activities).where(and(eq(activities.leadId, leadId), eq(activities.outcome, "da_confermare"))).orderBy(asc(activities.createdAt)),
  ]);

  const automazioni = cliente
    ? await db.select({ id: automations.id, name: automations.name, status: automations.status, activatedAt: automations.activatedAt })
      .from(automations).where(and(eq(automations.clientId, cliente.id), isNull(automations.deletedAt))).orderBy(asc(automations.createdAt))
    : [];
  const righeCanoni = cliente
    ? await db.select({ id: fees.id, amountCents: fees.amountCents, status: fees.status, billingDay: fees.billingDay, automationId: fees.automationId }).from(fees).where(eq(fees.clientId, cliente.id))
    : [];
  // Nome dell'automazione del canone: anche se dismessa o di un'automazione già cancellata resta il nome.
  const idAutomazioni = [...new Set(righeCanoni.map((f) => f.automationId).filter((x): x is string => x != null))];
  const nomi = idAutomazioni.length
    ? new Map((await db.select({ id: automations.id, name: automations.name }).from(automations).where(inArray(automations.id, idAutomazioni))).map((a) => [a.id, a.name]))
    : new Map<string, string>();

  return {
    proposte: righeProposte.map((p) => ({ id: p.id, number: p.number, status: p.status, data: p.sentAt ?? p.createdAt, setupCents: p.setupCents, feeCents: p.feeCents })),
    call: righeCall,
    cliente: cliente ?? null,
    automazioni,
    canoni: righeCanoni.map((f) => ({ ...f, automationName: f.automationId ? (nomi.get(f.automationId) ?? null) : null })),
    // Il tipo "invito_proposta" arriva con lo schema della corsia A: qui si filtra sul testo per non dipendere dall'enum.
    inviti: inviti.filter((a) => String(a.type) === "invito_proposta").map(({ id, body, createdAt }) => ({ id, body: body ?? "", createdAt })),
  };
}
