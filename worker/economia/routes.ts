import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { clients, costs, fees, invoices } from "../db/schema";
import type { AppEnv } from "../env";
import { leggiImpostazioni } from "../impostazioni/service";
import { audit } from "../lib/audit";
import { meseRoma } from "../lib/roma";
import { prossimoStatoCanone } from "./calcoli";
import { costiPerMese, cruscotto, elencoCanoni, elencoFatture } from "./service";

const GIORNO = 86_400_000;
const id = z.string().trim().min(1);
const importo = z.number().int().min(1, "Serve un importo").max(100_000_000);
const testo = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

async function clienteNelPerimetro(db: Db, clientId: string) {
  const c = await db.select().from(clients).where(and(eq(clients.id, clientId), isNull(clients.deletedAt))).get();
  if (!c) throw new HTTPException(404, { message: "Cliente inesistente" });
  if (c.scope !== "acceleriamo") throw new HTTPException(422, { message: "Il cliente è fuori perimetro: non entra in Economia" });
  return c;
}

export const economiaRoutes = new Hono<AppEnv>();

economiaRoutes.get("/cruscotto", async (c) => {
  const db = getDb(c.env.DB);
  const { obiettivo } = await leggiImpostazioni(db);
  return c.json(await cruscotto(db, c.env.DB, Date.now(), obiettivo.ricorrenteCents));
});

economiaRoutes.get("/canoni", async (c) => c.json({ canoni: await elencoCanoni(getDb(c.env.DB)) }));

economiaRoutes.post("/canoni", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({ clientId: id, amountCents: importo, billingDay: z.number().int().min(1).max(28).default(1), automationId: id.nullish(), note: testo(500), attivo: z.boolean().default(false) }).strict().parse(await c.req.json());
  await clienteNelPerimetro(db, b.clientId);
  const now = Date.now();
  const canone = { id: crypto.randomUUID(), clientId: b.clientId, automationId: b.automationId ?? null, amountCents: b.amountCents, billingDay: b.billingDay, status: b.attivo ? ("attivo" as const) : ("in_attesa" as const), startAt: b.attivo ? now : null, note: b.note };
  await db.insert(fees).values(canone);
  await audit(db, c.get("user").id, "fees", canone.id, "create", canone);
  return c.json({ canone }, 201);
});

economiaRoutes.post("/canoni/:id/stato", async (c) => {
  const db = getDb(c.env.DB);
  const { azione } = z.object({ azione: z.enum(["attiva", "pausa", "riprendi", "cessa"]) }).strict().parse(await c.req.json());
  const f = await db.select().from(fees).where(eq(fees.id, c.req.param("id"))).get();
  if (!f) return c.json({ error: "Canone inesistente" }, 404);
  const passo = prossimoStatoCanone(f.status, azione, Date.now());
  if ("errore" in passo) return c.json({ error: passo.errore }, 409);
  await db.update(fees).set(passo.campi).where(eq(fees.id, f.id));
  await audit(db, c.get("user").id, "fees", f.id, azione, passo.campi);
  return c.json({ ok: true });
});

economiaRoutes.get("/fatture", async (c) => c.json({ fatture: await elencoFatture(getDb(c.env.DB), Date.now()) }));

economiaRoutes.post("/fatture", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({
    clientId: id, kind: z.enum(["acconto", "saldo", "canone", "extra"]), amountCents: importo, number: testo(40), period: testo(40),
    issuedAt: z.number().int().nullish(), pdfUrl: z.string().url().max(500).nullish(), note: testo(500), feeId: id.nullish(),
  }).strict().parse(await c.req.json());
  await clienteNelPerimetro(db, b.clientId);
  const { fatture: imp } = await leggiImpostazioni(db);
  const fattura = { id: crypto.randomUUID(), clientId: b.clientId, feeId: b.feeId ?? null, kind: b.kind, number: b.number, amountCents: b.amountCents, period: b.period, issuedAt: b.issuedAt ?? null, dueAt: b.issuedAt ? b.issuedAt + imp.scadenzaGiorni * GIORNO : null, pdfUrl: b.pdfUrl ?? null, note: b.note };
  await db.insert(invoices).values(fattura);
  await audit(db, c.get("user").id, "invoices", fattura.id, "create", fattura);
  return c.json({ fattura }, 201);
});

async function fatturaDa(db: Db, invoiceId: string) {
  const f = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt))).get();
  if (!f) throw new HTTPException(404, { message: "Fattura inesistente" });
  return f;
}

// Spec 9.3: "Segna emessa" chiede il numero del programma di Diego; la scadenza parte dall'emissione.
economiaRoutes.post("/fatture/:id/emessa", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({ number: z.string().trim().min(1, "Serve il numero della fattura").max(40), issuedAt: z.number().int() }).strict().parse(await c.req.json());
  const f = await fatturaDa(db, c.req.param("id"));
  if (f.paidAt != null) return c.json({ error: "La fattura è già incassata" }, 409);
  const { fatture: imp } = await leggiImpostazioni(db);
  const campi = { number: b.number, issuedAt: b.issuedAt, dueAt: f.dueAt ?? b.issuedAt + imp.scadenzaGiorni * GIORNO };
  await db.update(invoices).set(campi).where(eq(invoices.id, f.id));
  await audit(db, c.get("user").id, "invoices", f.id, "emessa", campi);
  return c.json({ ok: true });
});

economiaRoutes.post("/fatture/:id/incassata", async (c) => {
  const db = getDb(c.env.DB);
  const { paidAt } = z.object({ paidAt: z.number().int() }).strict().parse(await c.req.json());
  if (paidAt > Date.now() + GIORNO) return c.json({ error: "La data di incasso non può essere nel futuro" }, 422);
  const f = await fatturaDa(db, c.req.param("id"));
  if (f.issuedAt == null) return c.json({ error: "Segna prima la fattura come emessa, con il suo numero" }, 409);
  await db.update(invoices).set({ paidAt }).where(eq(invoices.id, f.id));
  await audit(db, c.get("user").id, "invoices", f.id, "incassata", { paidAt });
  return c.json({ ok: true });
});

economiaRoutes.get("/costi", async (c) => c.json({ mesi: await costiPerMese(c.env.DB, Date.now()) }));

economiaRoutes.post("/costi", async (c) => {
  const db = getDb(c.env.DB);
  const b = z.object({ date: z.number().int(), category: z.enum(["strumenti", "costi_vivi", "altro"]), amountCents: importo, clientId: id.nullish(), automationId: id.nullish(), note: testo(300) }).strict().parse(await c.req.json());
  const costo = { id: crypto.randomUUID(), date: b.date, month: meseRoma(b.date), category: b.category, amountCents: b.amountCents, clientId: b.clientId ?? null, automationId: b.automationId ?? null, note: b.note };
  await db.insert(costs).values(costo);
  await audit(db, c.get("user").id, "costs", costo.id, "create", costo);
  return c.json({ costo }, 201);
});
