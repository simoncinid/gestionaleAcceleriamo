import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/client";
import { activities, users } from "../db/schema";
import type { AppEnv } from "../env";
import { contestoRegole } from "../impostazioni/service";
import { abbinaSchema, propostaManualeSchema, propostaPatchSchema } from "./schema";
import { abbina, aggiornaProposta, creaAMano, elencoProposte, ricontattiDi, unaProposta } from "./service";

export const proposalRoutes = new Hono<AppEnv>();

proposalRoutes.get("/", async (c) => c.json({ proposte: await elencoProposte(getDb(c.env.DB)) }));

proposalRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const proposta = await unaProposta(db, c.req.param("id"));
  const base = proposta.presentedAt ?? proposta.sentAt;
  const ricontatti = base ? ricontattiDi(base, await contestoRegole(db, Date.now())) : [];
  const storico = proposta.leadId
    ? await db.select({ id: activities.id, type: activities.type, body: activities.body, createdAt: activities.createdAt, authorId: activities.authorId, authorName: users.name })
        .from(activities).leftJoin(users, eq(users.id, activities.authorId))
        .where(and(eq(activities.leadId, proposta.leadId), eq(activities.type, "proposta"))).orderBy(desc(activities.createdAt))
    : [];
  return c.json({ proposta, ricontatti, storico });
});

proposalRoutes.post("/", async (c) => {
  const input = propostaManualeSchema.parse(await c.req.json());
  return c.json({ proposta: await creaAMano(getDb(c.env.DB), input, c.get("user").id, Date.now()) }, 201);
});

proposalRoutes.patch("/:id", async (c) => {
  const input = propostaPatchSchema.parse(await c.req.json());
  return c.json({ proposta: await aggiornaProposta(getDb(c.env.DB), c.req.param("id"), input, c.get("user").id, Date.now()) });
});

proposalRoutes.post("/:id/abbina", async (c) => {
  const { leadId } = abbinaSchema.parse(await c.req.json());
  return c.json({ proposta: await abbina(getDb(c.env.DB), c.req.param("id"), leadId, c.get("user").id, Date.now()) });
});
