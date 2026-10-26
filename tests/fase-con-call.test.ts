import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

type LeadBody = { lead: { id: string; stageId: string; nextAction: string | null; nextActionAt: number | null }; error?: string };

async function nuovoLead(cookie: string, company: string) {
  const res = await call("/api/leads", { method: "POST", json: { company } }, cookie);
  return ((await res.json()) as LeadBody).lead.id;
}

describe("Q14: fase che richiede una call", () => {
  it("verso Consulenza fissata senza data: 422 con messaggio italiano", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Senza Data Srl");
    const res = await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "appuntamento-confermato" } }, cookie);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("Per questa fase serve la call: scegli giorno e ora");
  });

  it("con la data: call creata, fase spostata, prossima azione è la call", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Con Data Srl");
    const quando = Date.now() + 2 * 86_400_000;
    const res = await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "appuntamento-confermato", callAt: quando } }, cookie);
    expect(res.status).toBe(200);
    const { lead } = (await res.json()) as LeadBody;
    expect(lead.stageId).toBe("appuntamento-confermato");
    expect(lead.nextAction).toBe("Call di conoscenza");
    expect(lead.nextActionAt).toBe(quando);
    const k = await env.DB.prepare("SELECT kind, scheduled_at FROM calls WHERE lead_id = ?").bind(id).first<{ kind: string; scheduled_at: number }>();
    expect(k).toEqual({ kind: "conoscenza", scheduled_at: quando });
  });

  it("Presentazione fissata crea una call di presentazione", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Presenta Srl");
    const quando = Date.now() + 3 * 86_400_000;
    const res = await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "presentazione-confermata", callAt: quando } }, cookie);
    const { lead } = (await res.json()) as LeadBody;
    expect(lead).toMatchObject({ stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: quando });
  });

  it("se la call c'è già (Annulla dopo uno spostamento) la data non serve", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Annulla Srl");
    const quando = Date.now() + 86_400_000;
    await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "appuntamento-confermato", callAt: quando } }, cookie);
    await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "da-richiamare" } }, cookie);
    const res = await call(`/api/leads/${id}`, { method: "PATCH", json: { stageId: "appuntamento-confermato" } }, cookie);
    expect(res.status).toBe(200);
    const { lead } = (await res.json()) as LeadBody;
    expect(lead).toMatchObject({ stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: quando });
  });

  it("le azioni multiple non spostano in una fase con call", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie, "Multi Srl");
    const res = await call("/api/leads/bulk", { method: "POST", json: { ids: [id], azione: "fase", valore: "appuntamento-confermato" } }, cookie);
    expect(res.status).toBe(422);
  });
});

describe("Q14: quali fasi chiedono la call", () => {
  it("appuntamento e presentazione sì, le altre no", async () => {
    const { callPerFase } = await import("../worker/regole/fasi-call");
    expect(callPerFase("appuntamento-confermato")).toBe("conoscenza");
    expect(callPerFase("presentazione-confermata")).toBe("presentazione");
    expect(callPerFase("da-richiamare")).toBeNull();
    expect(callPerFase(undefined)).toBeNull();
  });
});
