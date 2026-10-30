import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { JOB_KINDS, clients, jobTemplateTasks, jobTemplates, jobs, tasks, users } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { ammette } from "./calcoli";
import { Errore, creaLavoro } from "./service";

const taskModello = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Ogni task ha bisogno di un titolo").max(200),
  recurrence: z.enum(["una_tantum", "ricorrente"]),
  assigneeId: z.string().nullish(),
  dueDays: z.number().int().min(0).max(1000).nullish(),
  monthDay: z.number().int().min(1, "Il giorno del mese va da 1 a 28").max(28, "Il giorno del mese va da 1 a 28").nullish(),
}).strict();
const corpoModello = z.object({
  name: z.string().trim().min(1, "Il lavoro tipo ha bisogno di un nome").max(120),
  kind: z.enum(JOB_KINDS),
  tasks: z.array(taskModello).max(40),
}).strict();

export const lavoriTipoRoutes = new Hono<AppEnv>();

async function elencoModelli(db: ReturnType<typeof getDb>) {
  const [modelli, righe] = await Promise.all([
    db.select().from(jobTemplates).where(isNull(jobTemplates.deletedAt)).orderBy(asc(jobTemplates.createdAt)),
    db.select().from(jobTemplateTasks).orderBy(asc(jobTemplateTasks.position)),
  ]);
  return modelli.map((m) => ({ id: m.id, name: m.name, kind: m.kind, tasks: righe.filter((r) => r.templateId === m.id) }));
}

function verifica(b: z.infer<typeof corpoModello>) {
  for (const t of b.tasks) {
    if (!ammette(b.kind, t.recurrence)) throw new Errore(t.recurrence === "ricorrente" ? "Un lavoro una tantum non ha task ricorrenti" : "Un lavoro ricorrente non ha task una tantum", 400);
    if (t.recurrence === "ricorrente" && t.monthDay == null) throw new Errore("Una task ricorrente ha bisogno del giorno del mese", 400);
    if (t.recurrence === "una_tantum" && t.dueDays == null) throw new Errore("Una task una tantum ha bisogno dei giorni dall'avvio", 400);
  }
}

// Scrive le task del modello tenendo gli id di quelle che esistono già: le task ricorrenti già generate ci si riferiscono.
async function scriviTask(db: ReturnType<typeof getDb>, templateId: string, lista: z.infer<typeof taskModello>[]) {
  const esistenti = new Set((await db.select({ id: jobTemplateTasks.id }).from(jobTemplateTasks).where(eq(jobTemplateTasks.templateId, templateId))).map((r) => r.id));
  const righe = lista.map((t, i) => ({
    id: t.id && esistenti.has(t.id) ? t.id : crypto.randomUUID(), templateId, title: t.title, recurrence: t.recurrence, assigneeId: t.assigneeId ?? null,
    dueDays: t.recurrence === "una_tantum" ? t.dueDays ?? 0 : null, monthDay: t.recurrence === "ricorrente" ? t.monthDay ?? 1 : null, position: i + 1,
  }));
  const tieni = righe.map((r) => r.id);
  const passi = [
    tieni.length ? db.delete(jobTemplateTasks).where(and(eq(jobTemplateTasks.templateId, templateId), notInArray(jobTemplateTasks.id, tieni))) : db.delete(jobTemplateTasks).where(eq(jobTemplateTasks.templateId, templateId)),
    ...righe.map((r) => db.insert(jobTemplateTasks).values(r).onConflictDoUpdate({ target: jobTemplateTasks.id, set: { title: r.title, recurrence: r.recurrence, assigneeId: r.assigneeId, dueDays: r.dueDays, monthDay: r.monthDay, position: r.position } })),
  ];
  await db.batch(passi as unknown as [(typeof passi)[number], ...(typeof passi)[number][]]);
}

lavoriTipoRoutes.get("/", async (c) => c.json({ modelli: await elencoModelli(getDb(c.env.DB)) }));

lavoriTipoRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const b = corpoModello.parse(await c.req.json());
  verifica(b);
  const id = crypto.randomUUID();
  await db.insert(jobTemplates).values({ id, name: b.name, kind: b.kind, createdAt: Date.now() });
  await scriviTask(db, id, b.tasks);
  await audit(db, c.get("user").id, "job_template", id, "create", { name: b.name });
  return c.json({ id }, 201);
});

lavoriTipoRoutes.put("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const b = corpoModello.parse(await c.req.json());
  verifica(b);
  const r = await db.update(jobTemplates).set({ name: b.name, kind: b.kind }).where(and(eq(jobTemplates.id, id), isNull(jobTemplates.deletedAt))).returning({ id: jobTemplates.id });
  if (!r.length) return c.json({ error: "Lavoro tipo inesistente" }, 404);
  await scriviTask(db, id, b.tasks);
  await audit(db, c.get("user").id, "job_template", id, "update", { name: b.name });
  return c.json({ ok: true });
});

lavoriTipoRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const r = await db.update(jobTemplates).set({ deletedAt: Date.now() }).where(and(eq(jobTemplates.id, c.req.param("id")), isNull(jobTemplates.deletedAt))).returning({ id: jobTemplates.id });
  if (!r.length) return c.json({ error: "Lavoro tipo inesistente" }, 404);
  await audit(db, c.get("user").id, "job_template", c.req.param("id"), "delete");
  return c.json({ ok: true });
});

// ---- Lavori ----
export const lavoriRoutes = new Hono<AppEnv>();

const nuovoLavoro = z.object({
  clientId: z.string().nullish(),
  leadId: z.string().nullish(),
  clientName: z.string().trim().max(200).optional(),
  templateId: z.string().min(1),
  startAt: z.number().int(),
  automationId: z.string().nullish(),
  feeCents: z.number().int().min(0).max(100_000_000).nullish(),
  documenti: z.array(z.object({ name: z.string().trim().min(1).max(200), url: z.string().trim().url("Il link non è valido") })).max(5).optional(),
}).strict();

lavoriRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const clientId = c.req.query("clientId");
  const righe = await db.select({ j: jobs, cliente: clients.name }).from(jobs).innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(isNull(jobs.deletedAt), clientId ? eq(jobs.clientId, clientId) : undefined)).orderBy(asc(jobs.createdAt));
  return c.json({ lavori: righe.map(({ j, cliente }) => ({ id: j.id, clientId: j.clientId, cliente, name: j.name, startAt: j.startAt, feeCents: j.feeCents, status: j.status, automationId: j.automationId })) });
});

lavoriRoutes.post("/", async (c) => {
  const b = nuovoLavoro.parse(await c.req.json());
  try {
    const r = await creaLavoro(getDb(c.env.DB), b, c.get("user").id);
    return c.json(r, 201);
  } catch (e) {
    if (e instanceof Errore) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

// ---- Task ----
export const taskRoutes = new Hono<AppEnv>();

const campiTask = {
  title: z.string().trim().min(1, "La task ha bisogno di un titolo").max(200),
  clientId: z.string().nullish(),
  leadId: z.string().nullish(),
  jobId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  dueAt: z.number().int().nullish(),
  note: z.string().trim().max(2000).nullish(),
};

export type TaskRiga = {
  id: string; title: string; clientId: string | null; leadId: string | null; cliente: string | null; jobId: string | null; lavoro: string | null;
  assigneeId: string | null; dueAt: number | null; doneAt: number | null; doneBy: string | null; doneByName: string | null; note: string | null; month: string | null;
};

async function elencoTask(db: ReturnType<typeof getDb>, filtro: { assigneeId?: string; clientId?: string; leadId?: string; solo: "aperte" | "tutte" }): Promise<TaskRiga[]> {
  const righe = await db.select({ t: tasks, cliente: clients.name, lavoro: jobs.name }).from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId)).leftJoin(jobs, eq(jobs.id, tasks.jobId))
    .where(and(isNull(tasks.deletedAt), filtro.solo === "aperte" ? isNull(tasks.doneAt) : undefined,
      filtro.assigneeId ? eq(tasks.assigneeId, filtro.assigneeId) : undefined, filtro.clientId ? eq(tasks.clientId, filtro.clientId) : undefined,
      filtro.leadId ? eq(tasks.leadId, filtro.leadId) : undefined))
    .orderBy(asc(tasks.dueAt));
  const chi = [...new Set(righe.map((r) => r.t.doneBy).filter((x): x is string => !!x))];
  const nomi = chi.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, chi)) : [];
  return righe.map(({ t, cliente, lavoro }) => ({
    id: t.id, title: t.title, clientId: t.clientId, leadId: t.leadId, cliente, jobId: t.jobId, lavoro, assigneeId: t.assigneeId, dueAt: t.dueAt, doneAt: t.doneAt,
    doneBy: t.doneBy, doneByName: nomi.find((n) => n.id === t.doneBy)?.name ?? null, note: t.note, month: t.month,
  }));
}
export { elencoTask };

taskRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const chi = c.req.query("chi") === "tutte" ? undefined : c.get("user").id;
  return c.json({ task: await elencoTask(db, { assigneeId: chi, clientId: c.req.query("clientId"), leadId: c.req.query("leadId"), solo: c.req.query("stato") === "tutte" ? "tutte" : "aperte" }) });
});

taskRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campiTask).strict().parse(await c.req.json());
  const id = crypto.randomUUID();
  await db.insert(tasks).values({ id, ...b, createdAt: Date.now() });
  await audit(db, c.get("user").id, "task", id, "create", b);
  return c.json({ id }, 201);
});

taskRoutes.patch("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campiTask).partial().strict().parse(await c.req.json());
  const r = await db.update(tasks).set(b).where(and(eq(tasks.id, c.req.param("id")), isNull(tasks.deletedAt))).returning({ id: tasks.id });
  if (!r.length) return c.json({ error: "Task inesistente" }, 404);
  await audit(db, c.get("user").id, "task", c.req.param("id"), "update", b);
  return c.json({ ok: true });
});

taskRoutes.post("/:id/fatta", async (c) => {
  const db = getDb(c.env.DB);
  const now = Date.now();
  const r = await db.update(tasks).set({ doneAt: now, doneBy: c.get("user").id }).where(and(eq(tasks.id, c.req.param("id")), isNull(tasks.deletedAt))).returning({ id: tasks.id });
  if (!r.length) return c.json({ error: "Task inesistente" }, 404);
  await audit(db, c.get("user").id, "task", c.req.param("id"), "fatta", undefined, now);
  return c.json({ ok: true });
});

taskRoutes.delete("/:id/fatta", async (c) => {
  const db = getDb(c.env.DB);
  const r = await db.update(tasks).set({ doneAt: null, doneBy: null }).where(and(eq(tasks.id, c.req.param("id")), isNull(tasks.deletedAt))).returning({ id: tasks.id });
  if (!r.length) return c.json({ error: "Task inesistente" }, 404);
  await audit(db, c.get("user").id, "task", c.req.param("id"), "annulla_fatta");
  return c.json({ ok: true });
});

taskRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const r = await db.update(tasks).set({ deletedAt: Date.now() }).where(and(eq(tasks.id, c.req.param("id")), isNull(tasks.deletedAt))).returning({ id: tasks.id });
  if (!r.length) return c.json({ error: "Task inesistente" }, 404);
  await audit(db, c.get("user").id, "task", c.req.param("id"), "delete");
  return c.json({ ok: true });
});
