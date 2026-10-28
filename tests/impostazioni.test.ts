import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../worker/db/client";
import { contestoRegole, leggiImpostazioni } from "../worker/impostazioni/service";
import { authed, call } from "./helpers";

describe("impostazioni", () => {
  it("senza sessione 401 su tutte le rotte nuove", async () => {
    for (const p of ["/api/settings", "/api/stage-rules", "/api/templates"]) expect((await call(p)).status).toBe(401);
  });

  it("legge i default e li salva validati", async () => {
    const cookie = await authed();
    const all = (await (await call("/api/settings", {}, cookie)).json()) as { orario: { inizio: string }; sequenze: { attive: boolean }; conferma: { attiva: boolean } };
    expect(all.orario.inizio).toBe("08:30");
    expect(all.sequenze.attive).toBe(false);
    expect(all.conferma.attiva).toBe(true);

    const male = await call("/api/settings", { method: "PUT", json: { key: "orario", value: { giorni: [], inizio: "8", fine: "19:30" } } }, cookie);
    expect(male.status).toBe(400);
    const bene = await call("/api/settings", { method: "PUT", json: { key: "sequenze", value: { attive: true } } }, cookie);
    expect(bene.status).toBe(200);
    const dopo = (await (await call("/api/settings", {}, cookie)).json()) as { sequenze: { attive: boolean } };
    expect(dopo.sequenze.attive).toBe(true);
  });

  it("chiave sconosciuta rifiutata", async () => {
    const cookie = await authed();
    expect((await call("/api/settings", { method: "PUT", json: { key: "boh", value: 1 } }, cookie)).status).toBe(400);
  });

  it("regole: si leggono, ma le scadenze sono fisse (blocco 1, modifica 4)", async () => {
    const cookie = await authed();
    const { rules } = (await (await call("/api/stage-rules", {}, cookie)).json()) as { rules: { id: string; stageId: string | null; params: unknown; active: boolean }[] };
    expect(rules).toHaveLength(6);
    const sla = rules.find((r) => r.id === "sla-prima")!;
    const res = await call("/api/stage-rules", { method: "PUT", json: { rules: [{ ...sla, params: { minuti: 60, avvisoMinuti: 45 } }] } }, cookie);
    expect(res.status).toBe(422);
    const dopo = (await (await call("/api/stage-rules", {}, cookie)).json()) as { rules: { id: string; params: { minuti: number } }[] };
    expect(dopo.rules.find((r) => r.id === "sla-prima")!.params.minuti).toBe(30);
  });

  it("fase: la probabilità si cambia, l'azione no (blocco 1, modifica 4)", async () => {
    const cookie = await authed();
    const res = await call("/api/stages/in-attesa-decisione", { method: "PATCH", json: { probability: 75 } }, cookie);
    expect(res.status).toBe(200);
    expect((await call("/api/stages/in-attesa-decisione", { method: "PATCH", json: { suggestedNextAction: "Sentire Diego" } }, cookie)).status).toBe(422);
    const { stages } = (await (await call("/api/stages", {}, cookie)).json()) as { stages: { id: string; probability: number; suggestedNextAction: string }[] };
    expect(stages.find((s) => s.id === "in-attesa-decisione")).toMatchObject({ probability: 75 });
    expect((await call("/api/stages/chiuso", { method: "PATCH", json: { probability: 140 } }, cookie)).status).toBe(400);
  });

  it("modelli: crea, modifica, cancella; il modello di sistema non si cancella", async () => {
    const cookie = await authed();
    const nuovo = await call("/api/templates", { method: "POST", json: { channel: "whatsapp", title: "Prova", body: "Ciao {referente}" } }, cookie);
    expect(nuovo.status).toBe(201);
    const { template } = (await nuovo.json()) as { template: { id: string } };
    expect((await call(`/api/templates/${template.id}`, { method: "PATCH", json: { body: "Ciao {referente}, sono Tommaso" } }, cookie)).status).toBe(200);
    expect((await call(`/api/templates/${template.id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect((await call("/api/templates/mod-conferma", { method: "DELETE" }, cookie)).status).toBe(422);
    const { templates } = (await (await call("/api/templates", {}, cookie)).json()) as { templates: unknown[] };
    expect(templates).toHaveLength(8);
  });

  it("modelli: patch vuota 400, canale di un modello di sistema bloccato", async () => {
    const cookie = await authed();
    expect((await call("/api/templates/mod-primo-contatto", { method: "PATCH", json: {} }, cookie)).status).toBe(400);
    expect((await call("/api/templates/mod-conferma", { method: "PATCH", json: { channel: "whatsapp" } }, cookie)).status).toBe(422);
    expect((await call("/api/templates/mod-conferma", { method: "PATCH", json: { channel: "email", body: "Ciao {referente}, grazie" } }, cookie)).status).toBe(200);
  });

  it("un valore salvato rovinato o non valido torna al default", async () => {
    const ins = "INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, NULL, 0)";
    await env.DB.prepare(ins).bind("orario", JSON.stringify({ giorni: [], inizio: "8", fine: "19:30" })).run();
    await env.DB.prepare(ins).bind("conferma", "{non json").run();
    await env.DB.prepare(ins).bind("sequenze", JSON.stringify({ attive: true })).run();
    const imp = await leggiImpostazioni(getDb(env.DB));
    expect(imp.orario.inizio).toBe("08:30");
    expect(imp.conferma.attiva).toBe(true);
    expect(imp.sequenze.attive).toBe(true);
  });

  it("il contesto del motore legge Impostazioni e regole attive", async () => {
    const cookie = await authed();
    const db = getDb(env.DB);
    const base = await contestoRegole(db, 1_000);
    expect(base).toMatchObject({ ora: 1_000, sequenze: false, ricontatti: [3, 7, 14], pausaMesi: 2, oreProposta: 24, massimoTentativi: 5 });
    await call("/api/settings", { method: "PUT", json: { key: "sequenze", value: { attive: true } } }, cookie);
    // Le regole non si cambiano più dalla pagina (blocco 1, modifica 4): si cambiano nella tabella, come farebbe una migrazione.
    await env.DB.batch([
      env.DB.prepare("UPDATE stage_rules SET params = '{\"giorni\":[2,5]}' WHERE id = 'ricontatti-decisione'"),
      env.DB.prepare("UPDATE stage_rules SET active = 0 WHERE id = 'pausa-bloccato'"),
    ]);
    const dopo = await contestoRegole(db, 1_000);
    expect(dopo).toMatchObject({ sequenze: true, ricontatti: [2, 5], pausaMesi: 2 });
  });

  it("regole: qualsiasi salvataggio rifiutato, le scadenze sono fisse", async () => {
    const cookie = await authed();
    const { rules } = (await (await call("/api/stage-rules", {}, cookie)).json()) as { rules: { id: string; stageId: string | null; event: string | null; params: unknown; active: boolean }[] };
    const ric = rules.find((r) => r.id === "ricontatti-decisione")!;
    expect((await call("/api/stage-rules", { method: "PUT", json: { rules: [{ ...ric, params: { giorni: [] } }] } }, cookie)).status).toBe(422);
    expect((await call("/api/stage-rules", { method: "PUT", json: { rules: [{ ...ric, stageId: "boh" }] } }, cookie)).status).toBe(422);
  });
});
