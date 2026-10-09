import { Hono } from "hono";
import { getDb } from "../db/client";
import type { AppEnv } from "../env";
import { ERRORE_NON_COLLEGATO, ERRORE_SENZA_EMAIL, agenda, aggiornaCall, callPatchSchema, icsDellaCall, mandaInvito, unaCall } from "./service";

export const callRoutes = new Hono<AppEnv>();
const SETTIMANA = 7 * 86_400_000;

callRoutes.get("/", async (c) => {
  const da = Number(c.req.query("da")) || Date.now() - SETTIMANA;
  const a = Number(c.req.query("a")) || da + SETTIMANA;
  return c.json({ calls: await agenda(getDb(c.env.DB), da, a) });
});

callRoutes.patch("/:id", async (c) => {
  const input = callPatchSchema.parse(await c.req.json());
  return c.json({ call: await aggiornaCall(getDb(c.env.DB), c.req.param("id"), input, c.get("user").id, Date.now()) });
});

callRoutes.post("/:id/invito", async (c) => {
  const r = await mandaInvito(c.env, getDb(c.env.DB), c.req.param("id"), c.get("user").id, Date.now());
  if (r.ok) return c.json({ ok: true });
  const stato = r.errore === ERRORE_SENZA_EMAIL ? 422 : r.errore === ERRORE_NON_COLLEGATO ? 503 : 502;
  return c.json({ error: r.errore }, stato);
});

callRoutes.get("/:id/ics", async (c) => {
  const db = getDb(c.env.DB);
  const k = await unaCall(db, c.req.param("id"));
  return c.body(await icsDellaCall(db, k), 200, { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="invito.ics"' });
});
