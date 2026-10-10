import { HTTPException } from "hono/http-exception";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { clients, documents, fees, jobTemplateTasks, jobTemplates, jobs, leads, tasks } from "../db/schema";
import { audit } from "../lib/audit";
import { meseRoma } from "../lib/roma";
import { creaClienteDaLead } from "../leads/service";
import { primoMeseRicorrenti, ricorrenteDovuta, scadenzaRicorrente, taskIniziali } from "./calcoli";

export class Errore extends HTTPException {
  constructor(message: string, status: 400 | 404 | 409) { super(status, { message }); }
}

export type NuovoLavoro = {
  clientId?: string | null;
  leadId?: string | null;
  clientName?: string;
  templateId: string;
  startAt: number;
  automationId?: string | null;
  feeCents?: number | null;
  documenti?: { name: string; url: string }[];
};

const clienteDelLeadId = (db: Db, leadId: string) =>
  db.select({ id: clients.id }).from(clients).where(and(eq(clients.originLeadId, leadId), isNull(clients.deletedAt))).get();

// Crea il lavoro e le task una tantum in un colpo. Se arriva dal lead e il cliente non c'è, lo crea.
export async function creaLavoro(db: Db, b: NuovoLavoro, actorId: string | null, now = Date.now()): Promise<{ jobId: string; clientId: string; task: number }> {
  const modello = await db.select().from(jobTemplates).where(and(eq(jobTemplates.id, b.templateId), isNull(jobTemplates.deletedAt))).get();
  if (!modello) throw new Errore("Lavoro tipo inesistente", 404);
  let clientId = b.clientId ?? null;
  if (!clientId && b.leadId) {
    const lead = await db.select().from(leads).where(eq(leads.id, b.leadId)).get();
    if (!lead) throw new Errore("Lead inesistente", 404);
    if (!(await clienteDelLeadId(db, lead.id))) await creaClienteDaLead(db, lead, b.clientName, actorId, now);
    clientId = (await clienteDelLeadId(db, lead.id))?.id ?? null;
  }
  if (!clientId) throw new Errore("Serve un cliente", 400);
  const cliente = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), isNull(clients.deletedAt))).get();
  if (!cliente) throw new Errore("Cliente inesistente", 404);

  const modelli = await db.select().from(jobTemplateTasks).where(eq(jobTemplateTasks.templateId, modello.id)).orderBy(jobTemplateTasks.position);
  const jobId = crypto.randomUUID();
  const haRicorrenti = modello.kind !== "una_tantum" && modelli.some((m) => m.recurrence === "ricorrente");
  const nuove = taskIniziali(modelli, b.startAt).map(({ modello: m, dueAt }) => ({
    id: crypto.randomUUID(), title: m.title, clientId, jobId, templateTaskId: m.id, assigneeId: m.assigneeId, dueAt, createdAt: now,
  }));
  const passi = [
    db.insert(jobs).values({
      id: jobId, clientId, templateId: modello.id, name: modello.name, startAt: b.startAt, automationId: b.automationId ?? null,
      feeCents: b.feeCents ?? null, recurringFromMonth: haRicorrenti ? primoMeseRicorrenti(b.startAt) : null, status: "attivo", createdAt: now,
    }),
    ...nuove.map((t) => db.insert(tasks).values(t)),
    ...(b.leadId ? (b.documenti ?? []).map((d) => db.insert(documents).values({ id: crypto.randomUUID(), leadId: b.leadId!, name: d.name, url: d.url, createdBy: actorId, createdAt: now })) : []),
  ];
  await db.batch(passi as unknown as [(typeof passi)[number], ...(typeof passi)[number][]]);
  // Il canone del cliente: se Economia non ne ha ancora nessuno, nasce quello del lavoro (in attesa fino alla fatturazione).
  if (b.feeCents && b.feeCents > 0) {
    const gia = await db.select({ id: fees.id }).from(fees).where(eq(fees.clientId, clientId)).get();
    if (!gia) await db.insert(fees).values({ id: crypto.randomUUID(), clientId, automationId: b.automationId ?? null, amountCents: b.feeCents, billingDay: 1, status: "in_attesa", startAt: b.startAt });
  }
  await audit(db, actorId, "job", jobId, "create", { clientId, templateId: modello.id, task: nuove.length }, now);
  return { jobId, clientId, task: nuove.length };
}

// Giro programmato: per ogni lavoro attivo e ogni task ricorrente, se quella del mese non c'è e oggi è il giorno (o dopo), la crea.
// Costo: 2 letture più al massimo `limite` scritture. L'indice unico (lavoro, modello, mese) rende innocuo un doppio giro.
export async function generaRicorrenti(db: Db, now: number, limite: number): Promise<number> {
  const mese = meseRoma(now);
  const candidate = await db.select({
    jobId: jobs.id, clientId: jobs.clientId, daMese: jobs.recurringFromMonth,
    mid: jobTemplateTasks.id, title: jobTemplateTasks.title, assigneeId: jobTemplateTasks.assigneeId, giorno: jobTemplateTasks.monthDay,
  }).from(jobs)
    .innerJoin(jobTemplateTasks, and(eq(jobTemplateTasks.templateId, jobs.templateId), eq(jobTemplateTasks.recurrence, "ricorrente")))
    .where(and(eq(jobs.status, "attivo"), isNull(jobs.deletedAt)));
  const dovute = candidate.filter((r) => ricorrenteDovuta(now, r.daMese, r.giorno ?? 1));
  if (!dovute.length) return 0;
  const fatte = await db.select({ jobId: tasks.jobId, mid: tasks.templateTaskId }).from(tasks).where(eq(tasks.month, mese));
  const chiave = new Set(fatte.map((f) => `${f.jobId}:${f.mid}`));
  const mancanti = dovute.filter((r) => !chiave.has(`${r.jobId}:${r.mid}`)).slice(0, limite);
  if (!mancanti.length) return 0;
  const passi = mancanti.map((r) => db.insert(tasks).values({
    id: crypto.randomUUID(), title: r.title, clientId: r.clientId, jobId: r.jobId, templateTaskId: r.mid, month: mese,
    assigneeId: r.assigneeId, dueAt: scadenzaRicorrente(mese, r.giorno ?? 1), createdAt: now,
  }).onConflictDoNothing());
  await db.batch(passi as unknown as [(typeof passi)[number], ...(typeof passi)[number][]]);
  return mancanti.length;
}
