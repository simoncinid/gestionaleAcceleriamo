import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AppEnv } from "./env";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "Dati non validi" }, 400);
  const errorId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  console.error("errore_server", errorId, err);
  return c.json({ error: "Errore del server", errorId }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/_boom", (c) => {
  if (c.env.META_APP_SECRET !== "segreto-test") return c.json({ error: "Non trovato" }, 404);
  throw new Error("prova");
});
