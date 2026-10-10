import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AppEnv } from "./env";
import { requireAuth } from "./auth/session";
import { authRoutes } from "./auth/routes";
import { documentRoutes, leadRoutes } from "./leads/routes";
import { todayRoutes } from "./today/routes";
import { avvisiRoutes } from "./avvisi/routes";
import { badgeRoutes } from "./badge/routes";
import { callRoutes } from "./calls/routes";
import { agganciRoutes } from "./proposte/aggancio";
import { proposalRoutes } from "./proposte/routes";
import { metaRoutes } from "./meta/routes";
import { stageRoutes, userRoutes } from "./stages/routes";
import { settingsRoutes, stageRuleRoutes, templateRoutes } from "./impostazioni/routes";
import { integrazioniRoutes } from "./integrazioni/routes";
import { automazioniRoutes } from "./automazioni/routes";
import { clientiRoutes } from "./clienti/routes";
import { economiaRoutes } from "./economia/routes";
import { pushRoutes } from "./push/routes";
import { aiJobsRoutes, claudeRoutes } from "./claude/routes";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) return c.json({ error: err.issues[0]?.message ?? "Dati non validi" }, 400);
  const errorId = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  console.error("errore_server", errorId, err);
  return c.json({ error: "Errore del server", errorId }, 500);
});

const PUBLIC_PATHS = ["/api/health", "/api/_boom", "/api/auth/login", "/api/hooks/proposals"];

app.use("/api/*", async (c, next) => {
  if (PUBLIC_PATHS.includes(c.req.path) || c.req.path.startsWith("/api/webhooks/")) return next();
  return requireAuth(c, next);
});

app.route("/api/webhooks/meta", metaRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/leads", leadRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/stages", stageRoutes);
app.route("/api/users", userRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/stage-rules", stageRuleRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrazioniRoutes);
app.route("/api/badge", badgeRoutes);
app.route("/api/calls", callRoutes);
app.route("/api/proposals", proposalRoutes);
app.route("/api/hooks", agganciRoutes);
app.route("/api/economia", economiaRoutes);
app.route("/api/clients", clientiRoutes);
app.route("/api/automations", automazioniRoutes);
app.route("/api/notifications", avvisiRoutes);
app.route("/api/push-subscriptions", pushRoutes);
app.route("/api/claude", claudeRoutes);
app.route("/api/ai-jobs", aiJobsRoutes);
app.route("/api", todayRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/_boom", (c) => {
  if (c.env.META_APP_SECRET !== "segreto-test") return c.json({ error: "Non trovato" }, 404);
  throw new Error("prova");
});
