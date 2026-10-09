import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "../db/client";
import { messageTemplates, stageRules, stages } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { leggiImpostazioni, salvaImpostazione } from "./service";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get("/", async (c) => c.json(await leggiImpostazioni(getDb(c.env.DB))));

settingsRoutes.put("/", async (c) => {
  const { key, value } = z.object({ key: z.string(), value: z.unknown() }).strict().parse(await c.req.json());
  await salvaImpostazione(getDb(c.env.DB), key, value, c.get("user").id);
  return c.json({ ok: true });
});

const PARAMS: Record<string, z.ZodTypeAny> = {
  sla: z.object({ minuti: z.number().int().min(10).max(2880), avvisoMinuti: z.number().int().min(0).max(2880) }).strict(),
  tentativi: z.object({ massimo: z.number().int().min(1).max(10) }).strict(),
  preventivo_48h: z.object({ ore: z.number().int().min(1).max(720) }).strict(),
  ricontatti: z.object({ giorni: z.array(z.number().int().min(1).max(90)).min(1).max(6) }).strict(),
  pausa: z.object({ mesi: z.number().int().min(1).max(12) }).strict(),
  fermo: z.object({ giorni: z.number().int().min(1).max(90) }).strict(),
};

const regolaSchema = z.object({ id: z.string(), stageId: z.string().nullable(), event: z.string().nullable(), params: z.unknown(), active: z.boolean() });

export const stageRuleRoutes = new Hono<AppEnv>();

stageRuleRoutes.get("/", async (c) => {
  const rows = await getDb(c.env.DB).select().from(stageRules).orderBy(asc(stageRules.ruleKey));
  return c.json({ rules: rows.map((r) => ({ ...r, params: JSON.parse(r.params) })) });
});

stageRuleRoutes.put("/", async (c) => {
  const db = getDb(c.env.DB);
  const { rules } = z.object({ rules: z.array(regolaSchema).min(1) }).strict().parse(await c.req.json());
  const esistenti = await db.select().from(stageRules);
  const fasi = new Set((await db.select({ id: stages.id }).from(stages)).map((s) => s.id));
  const updates = rules.map((r) => {
    const prima = esistenti.find((e) => e.id === r.id);
    if (!prima) throw new HTTPException(404, { message: "Regola inesistente" });
    if (r.stageId !== null && !fasi.has(r.stageId)) throw new HTTPException(400, { message: "Fase inesistente" });
    const params = PARAMS[prima.ruleKey].parse(r.params);
    return db.update(stageRules).set({ stageId: r.stageId, event: r.event, params: JSON.stringify(params), active: r.active }).where(eq(stageRules.id, r.id));
  });
  await db.batch(updates as [(typeof updates)[number], ...(typeof updates)[number][]]);
  await audit(db, c.get("user").id, "stage_rules", "*", "update", rules);
  return c.json({ ok: true });
});

const modelloSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  title: z.string().trim().min(1, "Serve un titolo").max(80),
  subject: z.string().trim().max(200).nullish(),
  body: z.string().trim().min(1, "Scrivi il testo").max(4000),
  stageId: z.string().nullish(),
  sortOrder: z.number().int().optional(),
}).strict();

export const templateRoutes = new Hono<AppEnv>();

templateRoutes.get("/", async (c) => c.json({ templates: await getDb(c.env.DB).select().from(messageTemplates).orderBy(asc(messageTemplates.sortOrder)) }));

templateRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const input = modelloSchema.parse(await c.req.json());
  const template = { id: crypto.randomUUID(), key: null, subject: input.subject ?? null, stageId: input.stageId ?? null, sortOrder: input.sortOrder ?? 100, channel: input.channel, title: input.title, body: input.body };
  await db.insert(messageTemplates).values(template);
  await audit(db, c.get("user").id, "template", template.id, "create");
  return c.json({ template }, 201);
});

templateRoutes.patch("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const patch = modelloSchema.partial().refine((p) => Object.keys(p).length > 0, { message: "Niente da modificare" }).parse(await c.req.json());
  const id = c.req.param("id");
  const prima = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get();
  if (!prima) throw new HTTPException(404, { message: "Modello inesistente" });
  if (prima.key !== null && patch.channel !== undefined && patch.channel !== prima.channel) {
    throw new HTTPException(422, { message: "Il canale di un modello di sistema non si cambia" });
  }
  await db.update(messageTemplates).set(patch).where(eq(messageTemplates.id, id));
  await audit(db, c.get("user").id, "template", id, "update", patch);
  return c.json({ ok: true });
});

templateRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const prima = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get();
  if (!prima) throw new HTTPException(404, { message: "Modello inesistente" });
  if (prima.key === "conferma") throw new HTTPException(422, { message: "Il modello della conferma automatica si modifica, non si cancella" });
  await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
  await audit(db, c.get("user").id, "template", id, "delete");
  return c.json({ ok: true });
});
