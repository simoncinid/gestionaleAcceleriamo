import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { mandaPush, pushCollegate } from "./invio";

export const pushRoutes = new Hono<AppEnv>();

const Iscrizione = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "L'indirizzo del servizio push deve iniziare con https"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  etichetta: z.string().trim().min(1).max(60),
});

// La chiave pubblica serve al browser per iscriversi; senza chiavi VAPID è null e il pulsante resta spento.
pushRoutes.get("/chiave", (c) => c.json({ chiave: pushCollegate(c.env) ? c.env.VAPID_PUBLIC_KEY! : null }));

pushRoutes.get("/", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, etichetta, created_at AS createdAt, last_ok_at AS lastOkAt, rotta FROM push_subscriptions WHERE user_id = ?1 ORDER BY created_at")
    .bind(c.get("user").id).all<{ id: string; etichetta: string; createdAt: number; lastOkAt: number | null; rotta: number }>();
  return c.json({ dispositivi: r.results.map((d) => ({ ...d, rotta: d.rotta === 1 })) });
});

// Lo stesso endpoint riscritto (permesso ridato, browser reinstallato) aggiorna la riga e la riassegna a chi è entrato.
pushRoutes.post("/", async (c) => {
  const b = Iscrizione.parse(await c.req.json());
  const id = crypto.randomUUID();
  const r = await c.env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, etichetta, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, etichetta = excluded.etichetta, errori = 0, rotta = 0
    RETURNING id`).bind(id, c.get("user").id, b.endpoint, b.keys.p256dh, b.keys.auth, b.etichetta, Date.now()).first<{ id: string }>();
  return c.json({ id: r!.id }, 201);
});

// Cancella solo un dispositivo mio: l'id di un altro non fa niente.
pushRoutes.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?1 AND user_id = ?2").bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ ok: true });
});

// Prova (spec 11.5): "Manda una push di prova" ai miei dispositivi, al massimo 5.
export async function provaPush(c: { env: Env; userId: string }) {
  if (!pushCollegate(c.env)) return { stato: 409 as const, corpo: { error: "Le push non sono collegate: mancano le chiavi VAPID." } };
  const subs = (await c.env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1 AND rotta = 0 LIMIT 5").bind(c.userId).all<{ endpoint: string; p256dh: string; auth: string }>()).results;
  if (!subs.length) return { stato: 409 as const, corpo: { error: "Nessun dispositivo attivo: attiva le notifiche da Profilo." } };
  const now = Date.now();
  const esiti = await Promise.all(subs.map((s) => mandaPush(c.env, s, { titolo: "Push di prova", testo: "Se la vedi, le notifiche funzionano.", href: "/impostazioni/profilo" }, now)));
  return { stato: 200 as const, corpo: { inviate: esiti.filter((e) => e === "ok").length, totale: subs.length } };
}
