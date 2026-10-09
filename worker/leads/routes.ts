import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/client";
import { activities, documents, leads, users } from "../db/schema";
import type { AppEnv } from "../env";
import { addActivity, createLead, getLead, listLeads, mergeLeads, restoreLead, softDeleteLead, updateLead } from "./service";
import { activitySchema, documentSchema, leadCreateSchema, leadPatchSchema, mergeSchema } from "./validation";
import { audit } from "../lib/audit";

export const leadRoutes = new Hono<AppEnv>();

leadRoutes.get("/", async (c) => {
  const q = c.req.query();
  const rows = await listLeads(getDb(c.env.DB), { q: q.q, stageId: q.stageId, source: q.source, campaign: q.campaign, ownerId: q.ownerId });
  return c.json({ leads: rows });
});

leadRoutes.get("/trash", async (c) => c.json({ leads: await listLeads(getDb(c.env.DB), { deleted: true }) }));

leadRoutes.post("/", async (c) => {
  const input = leadCreateSchema.parse(await c.req.json());
  const lead = await createLead(getDb(c.env.DB), input, c.get("user").id);
  return c.json({ lead }, 201);
});

leadRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  const history = await db
    .select({ id: activities.id, type: activities.type, body: activities.body, createdAt: activities.createdAt, authorId: activities.authorId, authorName: users.name })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.authorId))
    .where(eq(activities.leadId, lead.id))
    .orderBy(desc(activities.createdAt));
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.leadId, lead.id), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
  const duplicateOf = lead.duplicateOfId
    ? ((await db.select({ id: leads.id, company: leads.company }).from(leads).where(and(eq(leads.id, lead.duplicateOfId), isNull(leads.deletedAt))).get()) ?? null)
    : null;
  return c.json({ lead, activities: history.map((a) => ({ ...a, authorName: a.authorName ?? "Sistema" })), documents: docs, duplicateOf });
});

leadRoutes.patch("/:id", async (c) => {
  const patch = leadPatchSchema.parse(await c.req.json());
  const lead = await updateLead(getDb(c.env.DB), c.req.param("id"), patch, c.get("user").id);
  return c.json({ lead });
});

leadRoutes.delete("/:id", async (c) => {
  await softDeleteLead(getDb(c.env.DB), c.req.param("id"), c.get("user").id);
  return c.json({ ok: true });
});

leadRoutes.post("/:id/restore", async (c) => {
  await restoreLead(getDb(c.env.DB), c.req.param("id"), c.get("user").id);
  return c.json({ ok: true });
});

leadRoutes.post("/:id/merge", async (c) => {
  const { intoId } = mergeSchema.parse(await c.req.json());
  const lead = await mergeLeads(getDb(c.env.DB), c.req.param("id"), intoId, c.get("user").id);
  return c.json({ lead });
});

leadRoutes.post("/:id/activities", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  const { type, body } = activitySchema.parse(await c.req.json());
  const now = Date.now();
  await addActivity(db, lead.id, type, body, c.get("user").id, now);
  await db.update(leads).set({ updatedAt: now }).where(eq(leads.id, lead.id));
  return c.json({ ok: true }, 201);
});

leadRoutes.post("/:id/documents", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  const { name, url } = documentSchema.parse(await c.req.json());
  const now = Date.now();
  const document = { id: crypto.randomUUID(), leadId: lead.id, name, url, r2Key: null, createdBy: c.get("user").id, createdAt: now, deletedAt: null };
  await db.insert(documents).values(document);
  await addActivity(db, lead.id, "documento", `Aggiunto il documento "${name}"`, c.get("user").id, now);
  return c.json({ document }, 201);
});

export const documentRoutes = new Hono<AppEnv>();

documentRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const doc = await db.select().from(documents).where(and(eq(documents.id, id), isNull(documents.deletedAt))).get();
  if (!doc) return c.json({ error: "Documento non trovato" }, 404);
  const now = Date.now();
  await db.update(documents).set({ deletedAt: now }).where(eq(documents.id, id));
  await addActivity(db, doc.leadId, "documento", `Tolto il documento "${doc.name}"`, c.get("user").id, now);
  await audit(db, c.get("user").id, "document", id, "delete", undefined, now);
  return c.json({ ok: true });
});
