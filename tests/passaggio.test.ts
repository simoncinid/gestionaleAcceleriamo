import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { call } from "./helpers";

// Spec 19.1, "Accesso": ogni rotta risponde 401 senza sessione. Elenco ricavato dalle rotte montate in worker/app.ts
// (Piano A e 1A); "x" sta per un id qualsiasi: il controllo della sessione viene prima di tutto il resto.
const PROTETTE: [string, string][] = [
  ["GET", "/api/auth/me"], ["POST", "/api/auth/logout"],
  ["GET", "/api/today"], ["GET", "/api/stats"], ["GET", "/api/badge"], ["GET", "/api/notifications"], ["POST", "/api/notifications/letti"],
  ["GET", "/api/leads"], ["POST", "/api/leads"], ["POST", "/api/leads/bulk"], ["GET", "/api/leads/trash"],
  ["GET", "/api/leads/x"], ["PATCH", "/api/leads/x"], ["DELETE", "/api/leads/x"], ["PATCH", "/api/leads/x/esito"],
  ["POST", "/api/leads/x/contatti"], ["GET", "/api/leads/x/calls"], ["POST", "/api/leads/x/calls"],
  ["GET", "/api/leads/x/proposals"], ["GET", "/api/leads/x/proposta"], ["POST", "/api/leads/x/restore"],
  ["POST", "/api/leads/x/merge"], ["POST", "/api/leads/x/activities"], ["POST", "/api/leads/x/documents"],
  ["DELETE", "/api/documents/x"],
  ["GET", "/api/stages"], ["PUT", "/api/stages/order"], ["PATCH", "/api/stages/x"], ["GET", "/api/users"],
  ["GET", "/api/settings"], ["PUT", "/api/settings"],
  ["GET", "/api/stage-rules"], ["PUT", "/api/stage-rules"],
  ["GET", "/api/templates"], ["POST", "/api/templates"], ["PATCH", "/api/templates/x"], ["DELETE", "/api/templates/x"],
  ["GET", "/api/calls"], ["PATCH", "/api/calls/x"], ["POST", "/api/calls/x/invito"], ["GET", "/api/calls/x/ics"],
  ["GET", "/api/proposals"], ["POST", "/api/proposals"], ["GET", "/api/proposals/x"], ["PATCH", "/api/proposals/x"],
  ["POST", "/api/proposals/x/abbina"],
  ["GET", "/api/integrations/status"], ["POST", "/api/integrations/foglio/leggi"], ["GET", "/api/integrations/foglio/anteprima"],
  ["GET", "/api/integrations/aggancio/registro"], ["POST", "/api/integrations/aggancio/prova"], ["POST", "/api/integrations/resend/prova"],
  ["GET", "/api/economia/cruscotto"], ["GET", "/api/economia/canoni"], ["POST", "/api/economia/canoni"],
  ["POST", "/api/economia/canoni/x/stato"], ["GET", "/api/economia/fatture"], ["POST", "/api/economia/fatture"],
  ["POST", "/api/economia/fatture/x/emessa"], ["POST", "/api/economia/fatture/x/incassata"],
  ["GET", "/api/economia/costi"], ["POST", "/api/economia/costi"],
  ["GET", "/api/clients"], ["POST", "/api/clients"], ["GET", "/api/clients/x"], ["PATCH", "/api/clients/x"],
  ["GET", "/api/automations"], ["POST", "/api/automations"], ["GET", "/api/automations/x"], ["PATCH", "/api/automations/x"],
  ["POST", "/api/automations/x/attiva"],
  ["GET", "/api/push-subscriptions"], ["GET", "/api/push-subscriptions/chiave"], ["POST", "/api/push-subscriptions"],
  ["DELETE", "/api/push-subscriptions/x"], ["POST", "/api/integrations/push/prova"],
  ["GET", "/api/numeri/funnel"], ["GET", "/api/numeri/campagne"], ["GET", "/api/numeri/previsione"], ["PUT", "/api/campaign-spend"],
  ["GET", "/api/weekly-reviews/corrente"], ["PATCH", "/api/weekly-reviews/x"], ["POST", "/api/weekly-reviews/x/commento"], ["GET", "/api/diario"],
  ["POST", "/api/integrations/telegram/collega"], ["POST", "/api/integrations/telegram/prova"], ["DELETE", "/api/integrations/telegram"],
  ["GET", "/api/me/profilo"], ["PATCH", "/api/me"], ["POST", "/api/me/password"],
  ["POST", "/api/import/leads"], ["GET", "/api/export/leads"], ["GET", "/api/audit"], ["GET", "/api/dati/riepilogo"], ["GET", "/api/search"],
  // Percorsi che non esistono: anche loro chiedono la sessione, non dicono cosa c'è.
  ["GET", "/api/qualcosa"], ["POST", "/api/hooks/altro"],
];

describe("pronto per il rilascio", () => {
  it("ogni rotta chiede la sessione", async () => {
    for (const [method, p] of PROTETTE) {
      const r = await call(p, { method, ...(method === "GET" ? {} : { json: {} }) });
      expect({ method, p, status: r.status }).toEqual({ method, p, status: 401 });
    }
  });

  it("l'aggancio è pubblico ma senza chiave, o con la chiave sbagliata, risponde 401", async () => {
    const corpo = { numero: "PROVA-1", stato: "sent", sourcePath: "prova" };
    expect((await call("/api/hooks/proposals", { method: "POST", json: corpo })).status).toBe(401);
    const sbagliata = await call("/api/hooks/proposals", { method: "POST", json: corpo, headers: { authorization: "Bearer chiave-sbagliata" } });
    expect(sbagliata.status).toBe(401);
  });

  it("si parte con sequenze e foglio spenti (spec 18.3, passi 3 e 4)", async () => {
    expect(IMPOSTAZIONI_DEFAULT.sequenze.attive).toBe(false);
    expect(IMPOSTAZIONI_DEFAULT.foglio.attivo).toBe(false);
    expect(await env.DB.prepare("SELECT count(*) n FROM settings").first()).toEqual({ n: 0 });
  });

  it("il piede della conferma è quello vero, senza testo provvisorio", () => {
    expect(IMPOSTAZIONI_DEFAULT.conferma.piede).toContain("Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505");
    expect(IMPOSTAZIONI_DEFAULT.conferma.piede).not.toMatch(/da completare/i);
  });

  it("le regole di partenza ci sono tutte", async () => {
    const { results } = await env.DB.prepare("SELECT id FROM stage_rules ORDER BY id").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(["fermo-aperte", "pausa-bloccato", "preventivo-48h", "ricontatti-decisione", "sla-prima", "tentativi-da-richiamare", "tentativi-non-chiamato"]);
  });
});
