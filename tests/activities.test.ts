import { describe, expect, it } from "vitest";
import { authed, call } from "./helpers";

async function newLead(cookie: string) {
  const res = await call("/api/leads", { method: "POST", json: { company: "Test" } }, cookie);
  return ((await res.json()) as { lead: { id: string; updatedAt: number } }).lead;
}

describe("storico e documenti", () => {
  it("aggiunge una chiamata allo storico con autore", async () => {
    const cookie = await authed();
    const lead = await newLead(cookie);
    const res = await call(`/api/leads/${lead.id}/activities`, { method: "POST", json: { type: "chiamata", body: "Non risponde" } }, cookie);
    expect(res.status).toBe(201);
    const detail = (await (await call(`/api/leads/${lead.id}`, {}, cookie)).json()) as { activities: { type: string; body: string; authorName: string }[] };
    expect(detail.activities[0]).toMatchObject({ type: "chiamata", body: "Non risponde", authorName: "Tommaso" });
  });

  it("rifiuta tipi riservati al sistema e testi vuoti", async () => {
    const cookie = await authed();
    const lead = await newLead(cookie);
    expect((await call(`/api/leads/${lead.id}/activities`, { method: "POST", json: { type: "cambio_fase", body: "x" } }, cookie)).status).toBe(400);
    expect((await call(`/api/leads/${lead.id}/activities`, { method: "POST", json: { type: "nota", body: "  " } }, cookie)).status).toBe(400);
  });

  it("aggiunge e toglie un documento come link", async () => {
    const cookie = await authed();
    const lead = await newLead(cookie);
    const res = await call(`/api/leads/${lead.id}/documents`, { method: "POST", json: { name: "Preventivo", url: "https://drive.google.com/x" } }, cookie);
    expect(res.status).toBe(201);
    const doc = ((await res.json()) as { document: { id: string } }).document;
    let detail = (await (await call(`/api/leads/${lead.id}`, {}, cookie)).json()) as { documents: { id: string }[]; activities: { type: string }[] };
    expect(detail.documents.map((d) => d.id)).toEqual([doc.id]);
    expect(detail.activities.some((a) => a.type === "documento")).toBe(true);
    await call(`/api/documents/${doc.id}`, { method: "DELETE" }, cookie);
    detail = (await (await call(`/api/leads/${lead.id}`, {}, cookie)).json()) as typeof detail;
    expect(detail.documents).toEqual([]);
  });

  it("rifiuta link che non sono http o https", async () => {
    const cookie = await authed();
    const lead = await newLead(cookie);
    const res = await call(`/api/leads/${lead.id}/documents`, { method: "POST", json: { name: "x", url: "javascript:alert(1)" } }, cookie);
    expect(res.status).toBe(400);
  });
});
