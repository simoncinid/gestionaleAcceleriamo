import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "../db/client";
import { stages, users } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";

const TONES = ["orange", "neutral", "yellow", "blue", "violet", "green", "red"] as const;

const stagePatchSchema = z
  .object({ label: z.string().trim().min(1, "Serve un nome").max(60).optional(), tone: z.enum(TONES).optional() })
  .strict()
  .refine((p) => p.label !== undefined || p.tone !== undefined, { message: "Niente da modificare" });
const orderSchema = z.object({ ids: z.array(z.string()).min(1) }).strict();

export const stageRoutes = new Hono<AppEnv>();

stageRoutes.get("/", async (c) => {
  const rows = await getDb(c.env.DB).select().from(stages).orderBy(asc(stages.sortOrder));
  return c.json({ stages: rows });
});

stageRoutes.put("/order", async (c) => {
  const db = getDb(c.env.DB);
  const { ids } = orderSchema.parse(await c.req.json());
  const all = await db.select({ id: stages.id }).from(stages);
  const known = new Set(all.map((s) => s.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new HTTPException(400, { message: "Il nuovo ordine deve contenere tutte le fasi una volta sola" });
  }
  await db.batch(ids.map((id, i) => db.update(stages).set({ sortOrder: (i + 1) * 10 }).where(eq(stages.id, id))) as [any, ...any[]]);
  await audit(db, c.get("user").id, "stage", "*", "reorder", { ids });
  return c.json({ ok: true });
});

stageRoutes.patch("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const patch = stagePatchSchema.parse(await c.req.json());
  const id = c.req.param("id");
  const existing = await db.select().from(stages).where(eq(stages.id, id)).get();
  if (!existing) return c.json({ error: "Fase inesistente" }, 404);
  await db.update(stages).set(patch).where(eq(stages.id, id));
  await audit(db, c.get("user").id, "stage", id, "update", patch);
  return c.json({ ok: true });
});

export const userRoutes = new Hono<AppEnv>();

userRoutes.get("/", async (c) => {
  const rows = await getDb(c.env.DB)
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
  return c.json({ users: rows });
});
