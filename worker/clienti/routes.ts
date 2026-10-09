import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { automations, clients, fees, leads, type Client, type Fee } from "../db/schema";
import { statoCliente, type StatoCliente } from "../economia/calcoli";
import { elencoFatture, type FatturaRiga } from "../economia/service";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";

export type ClienteRiga = Pick<Client, "id" | "name" | "sector" | "city" | "scope" | "originLeadId"> & { canoneCents: number; stato: StatoCliente };
export type SchedaClienteDati = {
  cliente: ClienteRiga;
  canoni: Fee[];
  automazioni: { id: string; name: string; status: "in_costruzione" | "attiva" | "in_pausa" | "dismessa" }[];
  fatture: FatturaRiga[];
  lead: { id: string; company: string } | null;
};

const campiCliente = {
  name: z.string().trim().min(1, "Il cliente ha bisogno di un nome").max(200),
  sector: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  scope: z.enum(["acceleriamo", "fuori_perimetro"]),
};

export const clientiRoutes = new Hono<AppEnv>();

clientiRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [tutti, canoni, autom] = await Promise.all([
    db.select().from(clients).where(isNull(clients.deletedAt)),
    db.select({ clientId: fees.clientId, status: fees.status, amountCents: fees.amountCents }).from(fees),
    db.select({ clientId: automations.clientId, status: automations.status }).from(automations).where(isNull(automations.deletedAt)),
  ]);
  const clienti: ClienteRiga[] = tutti
    .map((k) => {
      const suoi = canoni.filter((f) => f.clientId === k.id);
      return {
        id: k.id, name: k.name, sector: k.sector, city: k.city, scope: k.scope, originLeadId: k.originLeadId,
        canoneCents: suoi.filter((f) => f.status === "attivo").reduce((t, f) => t + f.amountCents, 0),
        stato: statoCliente(suoi, autom.filter((a) => a.clientId === k.id)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
  return c.json({ clienti });
});

clientiRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({ ...campiCliente, scope: campiCliente.scope.default("acceleriamo"), originLeadId: z.string().nullish() }).strict().parse(await c.req.json());
  const cliente = { id: crypto.randomUUID(), name: b.name, sector: b.sector || null, city: b.city || null, scope: b.scope, originLeadId: b.originLeadId ?? null, createdAt: Date.now() };
  await db.insert(clients).values(cliente);
  await audit(db, c.get("user").id, "clients", cliente.id, "create", cliente);
  return c.json({ cliente }, 201);
});

clientiRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const k = await db.select().from(clients).where(and(eq(clients.id, c.req.param("id")), isNull(clients.deletedAt))).get();
  if (!k) return c.json({ error: "Cliente inesistente" }, 404);
  const [canoni, autom, fatture, lead] = await Promise.all([
    db.select().from(fees).where(eq(fees.clientId, k.id)),
    db.select({ id: automations.id, name: automations.name, status: automations.status }).from(automations).where(and(eq(automations.clientId, k.id), isNull(automations.deletedAt))),
    elencoFatture(db, Date.now(), k.id),
    k.originLeadId ? db.select({ id: leads.id, company: leads.company }).from(leads).where(eq(leads.id, k.originLeadId)).get() : Promise.resolve(undefined),
  ]);
  const ultime = [...fatture].sort((a, b) => (b.issuedAt ?? Infinity) - (a.issuedAt ?? Infinity)).slice(0, 5);
  const dati: SchedaClienteDati = {
    cliente: { id: k.id, name: k.name, sector: k.sector, city: k.city, scope: k.scope, originLeadId: k.originLeadId, canoneCents: canoni.filter((f) => f.status === "attivo").reduce((t, f) => t + f.amountCents, 0), stato: statoCliente(canoni, autom) },
    canoni,
    automazioni: autom,
    fatture: ultime,
    lead: lead ?? null,
  };
  return c.json(dati);
});

clientiRoutes.patch("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object(campiCliente).partial().strict().parse(await c.req.json());
  const campi = { ...b, ...(b.sector !== undefined && { sector: b.sector || null }), ...(b.city !== undefined && { city: b.city || null }) };
  const r = await db.update(clients).set(campi).where(and(eq(clients.id, c.req.param("id")), isNull(clients.deletedAt))).returning({ id: clients.id });
  if (!r.length) return c.json({ error: "Cliente inesistente" }, 404);
  await audit(db, c.get("user").id, "clients", c.req.param("id"), "update", campi);
  return c.json({ ok: true });
});
