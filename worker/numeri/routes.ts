import { Hono, type Context } from "hono";
import { z } from "zod";
import { audit } from "../lib/audit";
import { getDb } from "../db/client";
import { meseRoma } from "../lib/roma";
import type { AppEnv } from "../env";
import { calcolaCampagne } from "./campagne";
import { calcolaFunnel } from "./funnel";
import { calcolaPrevisione } from "./previsione";

// Periodo predefinito: da sempre a senza fine, come la /stats della 1A.
const periodo = z.object({
  from: z.coerce.number().int().min(0).default(0),
  until: z.coerce.number().int().min(0).default(Number.MAX_SAFE_INTEGER),
});
const MESE = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mese nel formato AAAA-MM");
const spesa = z.object({ campagna: z.string().trim().min(1).max(200), mese: MESE, amountCents: z.number().int().min(0).max(10_000_000) });

export const numeriRoutes = new Hono<AppEnv>();
export const statsAlias = new Hono<AppEnv>();
export const spesaRoutes = new Hono<AppEnv>();

const funnel = async (c: Context<AppEnv>) => {
  const p = periodo.safeParse(c.req.query());
  if (!p.success) return c.json({ error: "Periodo non valido" }, 400);
  return c.json(await calcolaFunnel(c.env.DB, p.data.from, p.data.until));
};
numeriRoutes.get("/funnel", (c) => funnel(c));
statsAlias.get("/stats", (c) => funnel(c)); // spec 15.1: alias di /numeri/funnel per una versione
numeriRoutes.get("/campagne", async (c) => {
  const m = MESE.safeParse(c.req.query("mese") ?? meseRoma(Date.now()));
  if (!m.success) return c.json({ error: "Mese nel formato AAAA-MM" }, 400);
  return c.json(await calcolaCampagne(c.env.DB, m.data));
});
numeriRoutes.get("/previsione", async (c) => c.json(await calcolaPrevisione(c.env.DB)));

spesaRoutes.put("/", async (c) => {
  const p = spesa.safeParse(await c.req.json().catch(() => null));
  if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Dati non validi" }, 400);
  const now = Date.now();
  const userId = c.get("user").id;
  await c.env.DB.prepare(`INSERT INTO campaign_spend (id, campagna, mese, amount_cents, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (campagna, mese) DO UPDATE SET amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), p.data.campagna, p.data.mese, p.data.amountCents, userId, now).run();
  await audit(getDb(c.env.DB), userId, "campaign_spend", `${p.data.campagna}:${p.data.mese}`, "aggiorna", p.data, now);
  return c.json({ ok: true });
});
