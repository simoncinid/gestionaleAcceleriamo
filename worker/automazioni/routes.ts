import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { automations, clients, proposals, type Automation } from "../db/schema";
import { FAMIGLIE } from "../economia/calcoli";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";

export type AutomazioneRiga = Omit<Automation, "deletedAt"> & { cliente: string; settore: string | null; citta: string | null; scope: "acceleriamo" | "fuori_perimetro"; proposta: string | null };

const FAMIGLIA = z.enum(FAMIGLIE.map((f) => f.valore) as [string, ...string[]]);
const campi = {
  clientId: z.string().min(1),
  name: z.string().trim().min(1, "L'automazione ha bisogno di un nome").max(200),
  family: FAMIGLIA.nullish(),
  description: z.string().trim().max(2000).nullish(),
  runsOn: z.string().trim().max(200).nullish(),
  stack: z.string().trim().max(300).nullish(),
  monthlyCostCents: z.number().int().min(0).max(10_000_000).nullish(),
  techOwnerId: z.string().nullish(),
  pmOwnerId: z.string().nullish(),
  promisedAt: z.number().int().nullish(),
  proposalId: z.string().nullish(),
  notes: z.string().trim().max(4000).nullish(),
};

async function elenco(db: Db, automationId?: string): Promise<AutomazioneRiga[]> {
  const righe = await db
    .select({ a: automations, cliente: clients.name, settore: clients.sector, citta: clients.city, scope: clients.scope, proposta: proposals.number })
    .from(automations)
    .innerJoin(clients, eq(clients.id, automations.clientId))
    .leftJoin(proposals, eq(proposals.id, automations.proposalId))
    .where(and(isNull(automations.deletedAt), automationId ? eq(automations.id, automationId) : undefined))
    .orderBy(desc(automations.updatedAt));
  return righe.map(({ a, ...r }) => {
    const { deletedAt, ...campiA } = a;
    void deletedAt;
    return { ...campiA, ...r };
  });
}

const clienteEsiste = async (db: Db, clientId: string) =>
  Boolean(await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), isNull(clients.deletedAt))).get());

export const automazioniRoutes = new Hono<AppEnv>();

// Il Pannello mostra anche i clienti fuori perimetro (spec 9 e 10.1): solo Economia li esclude.
automazioniRoutes.get("/", async (c) => {
  const automazioni = await elenco(getDb(c.env.DB));
  const attive = automazioni.filter((a) => a.status === "attiva");
  return c.json({
    automazioni,
    totali: {
      attive: attive.length,
      inCostruzione: automazioni.filter((a) => a.status === "in_costruzione").length,
      costiViviCents: attive.reduce((t, a) => t + (a.monthlyCostCents ?? 0), 0),
    },
  });
});

automazioniRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campi).strict().parse(await c.req.json());
  if (!(await clienteEsiste(db, b.clientId))) return c.json({ error: "Cliente inesistente" }, 404);
  const now = Date.now();
  const automazione = { id: crypto.randomUUID(), ...b, status: "in_costruzione" as const, createdAt: now, updatedAt: now };
  await db.insert(automations).values(automazione);
  await audit(db, c.get("user").id, "automations", automazione.id, "create", automazione);
  return c.json({ automazione }, 201);
});

automazioniRoutes.get("/:id", async (c) => {
  const [automazione] = await elenco(getDb(c.env.DB), c.req.param("id"));
  if (!automazione) return c.json({ error: "Automazione inesistente" }, 404);
  return c.json({ automazione });
});

automazioniRoutes.patch("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campi).partial().strict().parse(await c.req.json());
  if (b.clientId && !(await clienteEsiste(db, b.clientId))) return c.json({ error: "Cliente inesistente" }, 404);
  const r = await db.update(automations).set({ ...b, updatedAt: Date.now() }).where(and(eq(automations.id, c.req.param("id")), isNull(automations.deletedAt))).returning({ id: automations.id });
  if (!r.length) return c.json({ error: "Automazione inesistente" }, 404);
  await audit(db, c.get("user").id, "automations", c.req.param("id"), "update", b);
  return c.json({ ok: true });
});

// Spec 10.3: "Segna attiva" solo da in costruzione. Il secondo tocco trova lo stato già cambiato e riceve 409.
automazioniRoutes.post("/:id/attiva", async (c) => {
  const db = getDb(c.env.DB);
  const now = Date.now();
  const r = await db.update(automations).set({ status: "attiva", activatedAt: now, updatedAt: now })
    .where(and(eq(automations.id, c.req.param("id")), eq(automations.status, "in_costruzione"), isNull(automations.deletedAt))).returning({ id: automations.id });
  if (!r.length) return c.json({ error: "L'automazione non è in costruzione" }, 409);
  await audit(db, c.get("user").id, "automations", c.req.param("id"), "attiva", { activatedAt: now });
  return c.json({ ok: true });
});
