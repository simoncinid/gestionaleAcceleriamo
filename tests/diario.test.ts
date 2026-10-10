import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { call, createUser, loginCookie } from "./helpers";

let cookie = "";
beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  await createUser("diego", "password-lunga-2", "Diego Simoncini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
  await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('L1', 'Officina Bertini', 'meta', 'da-richiamare', 0, 0, 0)").run();
  await env.DB.prepare(`INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES
    ('A1', 'L1', 'esito', 'richiamare', 'diego', 3000),
    ('A2', 'L1', 'meta', 'Lead arrivato da Meta', NULL, 1000)`).run();
  await env.DB.prepare(`INSERT INTO audit_log (id, user_id, entity, entity_id, action, changes, created_at) VALUES
    ('U1', 'diego', 'invoices', 'F1', 'emessa', '{"amountCents":120000}', 2000),
    ('U2', 'tommaso', 'lead', 'L1', 'update', '{}', 2500)`).run();
});

describe("GET /api/diario", () => {
  it("attività e modifiche di soldi e automazioni, dal più recente, con chi l'ha fatto", async () => {
    const d = await (await call("/api/diario", {}, cookie)).json<{ voci: { id: string; chi: string; testo: string; area: string }[]; prossimo: number | null }>();
    expect(d.voci.map((v) => v.id)).toEqual(["A1", "U1", "A2"]); // U2 (lead) è già nelle attività: non si ripete
    expect(d.voci[0]).toMatchObject({ chi: "Diego Simoncini", area: "commerciale" });
    expect(d.voci[0].testo).toContain("Officina Bertini");
    expect(d.voci[1]).toMatchObject({ chi: "Diego Simoncini", area: "economia" });
    expect(d.voci[2].chi).toBe("Sistema");
    expect(d.prossimo).toBeNull();
  });
  it("filtri per persona e per area", async () => {
    const p = await (await call("/api/diario?chi=sistema", {}, cookie)).json<{ voci: { id: string }[] }>();
    expect(p.voci.map((v) => v.id)).toEqual(["A2"]);
    const a = await (await call("/api/diario?area=economia", {}, cookie)).json<{ voci: { id: string }[] }>();
    expect(a.voci.map((v) => v.id)).toEqual(["U1"]);
  });
  it("tipo fuori elenco: nessuna interpolazione, nessuna voce; filtro per tipo", async () => {
    const x = await call(`/api/diario?tipo=${encodeURIComponent("esito' OR 1=1 --")}`, {}, cookie);
    expect(x.status).toBe(200);
    expect((await x.json<{ voci: unknown[] }>()).voci).toEqual([]);
    const e = await (await call("/api/diario?tipo=esito", {}, cookie)).json<{ voci: { id: string }[] }>();
    expect(e.voci.map((v) => v.id)).toEqual(["A1"]);
    expect((await call("/api/diario?area=altro", {}, cookie)).status).toBe(400);
  });
  it("pagine da 50: prossimo porta alle voci prima", async () => {
    const righe = Array.from({ length: 60 }, (_, i) => `('N${i}', 'L1', 'nota', 'nota ${i}', 'tommaso', ${10_000 + i})`).join(", ");
    await env.DB.prepare(`INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ${righe}`).run();
    const p1 = await (await call("/api/diario", {}, cookie)).json<{ voci: { id: string }[]; prossimo: number | null }>();
    expect(p1.voci).toHaveLength(50);
    expect(p1.voci[0].id).toBe("N59");
    expect(p1.prossimo).toBe("10010:N10");
    const p2 = await (await call(`/api/diario?prima=${p1.prossimo}`, {}, cookie)).json<{ voci: { id: string }[]; prossimo: number | null }>();
    expect(p2.voci.map((v) => v.id)).toEqual([...Array.from({ length: 10 }, (_, i) => `N${9 - i}`), "A1", "U1", "A2"]);
    expect(p2.prossimo).toBeNull();
  });
  it("60 voci nello stesso istante (scadiProposte): nessuna persa né ripetuta al confine di pagina", async () => {
    const righe = Array.from({ length: 60 }, (_, i) => `('S${String(i).padStart(2, "0")}', 'L1', 'proposta', 'scaduta', NULL, 20000)`).join(", ");
    await env.DB.prepare(`INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ${righe}`).run();
    const p1 = await (await call("/api/diario", {}, cookie)).json<{ voci: { id: string }[]; prossimo: string | null }>();
    expect(p1.voci).toHaveLength(50);
    const p2 = await (await call(`/api/diario?prima=${encodeURIComponent(p1.prossimo!)}`, {}, cookie)).json<{ voci: { id: string }[]; prossimo: string | null }>();
    const visti = [...p1.voci, ...p2.voci].map((v) => v.id).filter((id) => id.startsWith("S"));
    expect(visti).toHaveLength(60);
    expect(new Set(visti).size).toBe(60);
  });
  it("cursore non valido: 400", async () => {
    expect((await call("/api/diario?prima=abc", {}, cookie)).status).toBe(400);
  });
  it("401 senza sessione", async () => {
    expect((await call("/api/diario")).status).toBe(401);
  });
});
