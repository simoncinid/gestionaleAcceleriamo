import "./lib/zod-it";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AppEnv } from "./env";
import { requireAuth } from "./auth/session";
import { authRoutes } from "./auth/routes";
import { documentRoutes, leadRoutes } from "./leads/routes";
import { todayRoutes } from "./today/routes";
import { numeriRoutes, spesaRoutes, statsAlias } from "./numeri/routes";
import { lunediRoutes } from "./lunedi/routes";
import { diarioRoutes } from "./diario/routes";
import { avvisiRoutes } from "./avvisi/routes";
import { badgeRoutes } from "./badge/routes";
import { analisiRoutes, coachRoutes } from "./calls/coach-routes";
import { callRoutes } from "./calls/routes";
import { agganciRoutes } from "./proposte/aggancio";
import { proposalRoutes } from "./proposte/routes";
import { metaRoutes } from "./meta/routes";
import { stageRoutes, userRoutes } from "./stages/routes";
import { settingsRoutes, stageRuleRoutes, templateRoutes } from "./impostazioni/routes";
import { integrazioniRoutes } from "./integrazioni/routes";
import { automazioniRoutes } from "./automazioni/routes";
import { clientiRoutes } from "./clienti/routes";
import { lavoriRoutes, lavoriTipoRoutes, taskRoutes } from "./lavori/routes";
import { economiaRoutes } from "./economia/routes";
import { pushRoutes } from "./push/routes";
import { aiJobsRoutes, claudeRoutes } from "./claude/routes";
import "./claude/tipi";
import { schedeRoutes } from "./schede/routes";
import { meRoutes } from "./me/routes";
import { datiRoutes } from "./dati/routes";
import { ricercaRoutes } from "./ricerca/routes";

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

// Spazio demo (spec 12): il frontend lo legge per il banner. Dietro la sessione come ogni rotta /api.
app.get("/api/spazio", (c) => c.json({ demo: c.env.SPAZIO === "demo" }));
app.route("/api/webhooks/meta", metaRoutes);
app.route("/api/auth", authRoutes);
// Prima delle rotte dei lead: /api/leads/:id/scheda-azienda.
app.route("/api/leads", schedeRoutes);
app.route("/api/leads", leadRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/stages", stageRoutes);
app.route("/api/users", userRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/stage-rules", stageRuleRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/integrations", integrazioniRoutes);
app.route("/api/badge", badgeRoutes);
app.route("/api/calls", coachRoutes);
app.route("/api/calls", callRoutes);
app.route("/api/call-analyses", analisiRoutes);
app.route("/api/proposals", proposalRoutes);
app.route("/api/hooks", agganciRoutes);
app.route("/api/economia", economiaRoutes);
app.route("/api/clients", clientiRoutes);
app.route("/api/automations", automazioniRoutes);
app.route("/api/job-templates", lavoriTipoRoutes);
app.route("/api/jobs", lavoriRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/notifications", avvisiRoutes);
app.route("/api/push-subscriptions", pushRoutes);
app.route("/api/claude", claudeRoutes);
app.route("/api/ai-jobs", aiJobsRoutes);
app.route("/api/numeri", numeriRoutes);
app.route("/api/campaign-spend", spesaRoutes);
app.route("/api/weekly-reviews", lunediRoutes);
app.route("/api/diario", diarioRoutes);
app.route("/api/me", meRoutes);
app.route("/api", datiRoutes);
app.route("/api", ricercaRoutes);
app.route("/api", statsAlias);
app.route("/api", todayRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/_boom", (c) => {
  if (c.env.META_APP_SECRET !== "segreto-test") return c.json({ error: "Non trovato" }, 404);
  throw new Error("prova");
});
