import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { authed, call } from "./helpers";

type LeadBody = { lead: Record<string, unknown> & { id: string } };

async function create(cookie: string, json: Record<string, unknown>) {
  const res = await call("/api/leads", { method: "POST", json }, cookie);
  return { res, body: (await res.json()) as LeadBody & { error?: string } };
}

describe("lead", () => {
  it("crea un lead a mano con prossima azione di default e storico", async () => {
    const cookie = await authed();
    const { res, body } = await create(cookie, { company: "Rossi Srl", phone: "+39 333 1234567" });
    expect(res.status).toBe(201);
    expect(body.lead.stageId).toBe("da-chiamare-prima-volta");
    expect(body.lead.nextAction).toBe("Prima chiamata");
    expect(typeof body.lead.nextActionAt).toBe("number");
    expect(body.lead.createdBy).toBe("tommaso");
    const detail = (await (await call(`/api/leads/${body.lead.id}`, {}, cookie)).json()) as { activities: { type: string; authorName: string }[] };
    expect(detail.activities[0]).toMatchObject({ type: "creazione", authorName: "Tommaso" });
    const audit = await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id = ?").bind(body.lead.id).first<{ action: string }>();
    expect(audit?.action).toBe("create");
  });

  it("rifiuta un lead senza azienda con un messaggio chiaro", async () => {
    const cookie = await authed();
    const { res, body } = await create(cookie, { company: "  " });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Serve il nome dell'azienda");
  });

  it("riconosce i doppioni da telefono scritto diverso e da email con maiuscole", async () => {
    const cookie = await authed();
    const a = await create(cookie, { company: "A", phone: "+39 333 1234567", email: "info@a.it" });
    const b = await create(cookie, { company: "A bis", phone: "0039 3331234567" });
    const c = await create(cookie, { company: "A ter", email: " INFO@A.it" });
    const d = await create(cookie, { company: "Altro", phone: "3470000000" });
    expect(b.body.lead.duplicateOfId).toBe(a.body.lead.id);
    expect(c.body.lead.duplicateOfId).toBe(a.body.lead.id);
    expect(d.body.lead.duplicateOfId).toBeNull();
  });

  it("riconosce il doppione anche con telefono scritto con trattini", async () => {
    const cookie = await authed();
    const a = await create(cookie, { company: "H", phone: "+39 333 1234567" });
    const b = await create(cookie, { company: "H bis", phone: "333-123-4567" });
    expect(b.body.lead.duplicateOfId).toBe(a.body.lead.id);
  });

  it("cambio di fase: storico e, se chiuso, niente prossima azione", async () => {
    const cookie = await authed();
    const { body } = await create(cookie, { company: "B" });
    const res = await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { stageId: "chiuso", setupCents: 200_000, feeCents: 15_000, wonStartAt: 1_900_000_000_000 } }, cookie);
    const lead = ((await res.json()) as LeadBody).lead;
    expect(lead.stageId).toBe("chiuso");
    expect(lead.nextAction).toBeNull();
    expect(lead.nextActionAt).toBeNull();
    const detail = (await (await call(`/api/leads/${body.lead.id}`, {}, cookie)).json()) as { activities: { type: string; body: string }[] };
    expect(detail.activities.find((a) => a.type === "cambio_fase")?.body).toBe('Da "Nuovo, da chiamare" a "Cliente"');
  });

  it("riaprire un lead chiuso senza prossima azione dà 422, con la prossima azione funziona", async () => {
    const cookie = await authed();
    const { body } = await create(cookie, { company: "C" });
    await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { stageId: "non-chiuso", lostReason: "non_interessato" } }, cookie);
    const bad = await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { stageId: "da-richiamare" } }, cookie);
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "Serve una prossima azione con data per i lead aperti" });
    const ok = await call(
      `/api/leads/${body.lead.id}`,
      { method: "PATCH", json: { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: 1_900_000_000_000 } },
      cookie,
    );
    expect(ok.status).toBe(200);
  });

  it("modificare solo un campo non cancella gli altri", async () => {
    const cookie = await authed();
    const { body } = await create(cookie, { company: "D", email: "d@d.it", notes: "nota" });
    const res = await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { company: "D Srl" } }, cookie);
    const lead = ((await res.json()) as LeadBody).lead;
    expect(lead).toMatchObject({ company: "D Srl", email: "d@d.it", notes: "nota" });
  });

  it("rifiuta campi sconosciuti e responsabili inesistenti", async () => {
    const cookie = await authed();
    const { body } = await create(cookie, { company: "E" });
    expect((await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { createdBy: "x" } }, cookie)).status).toBe(400);
    const owner = await call(`/api/leads/${body.lead.id}`, { method: "PATCH", json: { ownerId: "nessuno" } }, cookie);
    expect(owner.status).toBe(400);
    expect(await owner.json()).toEqual({ error: "Responsabile inesistente" });
  });

  it("cestino e ripristino", async () => {
    const cookie = await authed();
    const { body } = await create(cookie, { company: "F" });
    await call(`/api/leads/${body.lead.id}`, { method: "DELETE" }, cookie);
    expect((await call(`/api/leads/${body.lead.id}`, {}, cookie)).status).toBe(404);
    const list = (await (await call("/api/leads", {}, cookie)).json()) as { leads: { id: string }[] };
    expect(list.leads.map((l) => l.id)).not.toContain(body.lead.id);
    const trash = (await (await call("/api/leads/trash", {}, cookie)).json()) as { leads: { id: string }[] };
    expect(trash.leads.map((l) => l.id)).toContain(body.lead.id);
    await call(`/api/leads/${body.lead.id}/restore`, { method: "POST" }, cookie);
    expect((await call(`/api/leads/${body.lead.id}`, {}, cookie)).status).toBe(200);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("unire un doppione sposta lo storico e completa i campi vuoti", async () => {
    const cookie = await authed();
    const a = await create(cookie, { company: "G", phone: "3331112222" });
    const b = await create(cookie, { company: "G doppio", phone: "333 111 2222", email: "g@g.it", website: "g.it" });
    const res = await call(`/api/leads/${b.body.lead.id}/merge`, { method: "POST", json: { intoId: a.body.lead.id } }, cookie);
    const merged = ((await res.json()) as LeadBody).lead;
    expect(merged).toMatchObject({ id: a.body.lead.id, company: "G", email: "g@g.it", website: "g.it" });
    expect((await call(`/api/leads/${b.body.lead.id}`, {}, cookie)).status).toBe(404);
    const detail = (await (await call(`/api/leads/${a.body.lead.id}`, {}, cookie)).json()) as { activities: { type: string }[] };
    expect(detail.activities.filter((x) => x.type === "creazione")).toHaveLength(2);
    expect(detail.activities.some((x) => x.type === "unione")).toBe(true);
  });

  it("cerca per azienda, referente, email e telefono", async () => {
    const cookie = await authed();
    await create(cookie, { company: "Officina Bianchi", contactName: "Luca" });
    await create(cookie, { company: "Studio Verdi", email: "anna@verdi.it" });
    const q = async (s: string) =>
      ((await (await call(`/api/leads?q=${encodeURIComponent(s)}`, {}, cookie)).json()) as { leads: { company: string }[] }).leads.map((l) => l.company);
    expect(await q("bianchi")).toEqual(["Officina Bianchi"]);
    expect(await q("luca")).toEqual(["Officina Bianchi"]);
    expect(await q("verdi.it")).toEqual(["Studio Verdi"]);
  });
});
