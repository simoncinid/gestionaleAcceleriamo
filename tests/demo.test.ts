import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { datiDemo, sqlDemo } from "../scripts/demo-dati";
import { app } from "../worker/app";
import { RisultatoCoach } from "../worker/claude/coach";
import { hashPassword } from "../worker/auth/password";
import { LEAD_SOURCES, LOST_REASONS } from "../worker/db/schema";
import { call, createUser, loginCookie } from "./helpers";

const ORA = Date.UTC(2026, 9, 15, 9);

async function semina() {
  const sql = sqlDemo(datiDemo(ORA, await hashPassword("password-demo-1", 1000)));
  await env.DB.batch(sql.map((s) => env.DB.prepare(s)));
}

describe("dati della demo", () => {
  it("40 lead di settori veri, contatti finti, tre automazioni anonime", () => {
    const d = datiDemo(ORA, "hash");
    expect(d.leads).toHaveLength(40);
    expect(new Set(d.leads.map((l) => l.notes)).size).toBeGreaterThanOrEqual(5);
    expect(d.leads.every((l) => l.email == null || l.email.endsWith("@esempio.it"))).toBe(true);
    expect(d.leads.every((l) => l.phone == null || l.phone.startsWith("+39 000"))).toBe(true);
    expect(d.automations).toHaveLength(3);
    expect(d.automations.every((a) => !d.clients.some((c) => a.name.includes(c.name)))).toBe(true);
    expect(d.companyProfiles.length).toBeGreaterThanOrEqual(5);
    expect(d.callAnalyses.length).toBeGreaterThanOrEqual(2);
    expect(datiDemo(ORA, "hash")).toEqual(d);
  });
  it("valori ammessi dallo schema: fonti, motivi di perdita, siti su esempio.it", () => {
    const d = datiDemo(ORA, "hash");
    expect(d.leads.every((l) => (LEAD_SOURCES as readonly string[]).includes(l.source!))).toBe(true);
    expect(d.leads.every((l) => l.lostReason == null || (LOST_REASONS as readonly string[]).includes(l.lostReason))).toBe(true);
    expect(d.leads.every((l) => l.website == null || new URL(l.website).hostname.endsWith(".esempio.it"))).toBe(true);
  });
  it("una istruzione per riga, prima le DELETE poi le INSERT", () => {
    const sql = sqlDemo(datiDemo(ORA, "hash"));
    expect(sql.every((s) => !s.includes("\n"))).toBe(true);
    const primaInsert = sql.findIndex((s) => s.startsWith("INSERT"));
    expect(sql.slice(0, primaInsert).every((s) => s.startsWith("DELETE FROM "))).toBe(true);
    expect(sql.slice(primaInsert).every((s) => s.startsWith("INSERT INTO "))).toBe(true);
  });
  it("si semina due volte e si ritrova uguale (ripristino)", async () => {
    await semina();
    await semina();
    const n = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM leads) AS l, (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM automations) AS a").first<{ l: number; u: number; a: number }>();
    expect(n).toEqual({ l: 40, u: 1, a: 3 });
    // Gli a capo della scheda tornano a capo veri dopo char(10).
    const scheda = await env.DB.prepare("SELECT content FROM company_profiles LIMIT 1").first<{ content: string }>();
    expect(scheda?.content).toContain("\n## Cosa fa l'azienda");
  });
  it("l'utente demo entra con la sua password", async () => {
    await semina();
    expect(await loginCookie("demo", "password-demo-1")).not.toBe("");
  });
});

describe("GET /api/spazio", () => {
  it("dice se è lo spazio demo", async () => {
    await createUser();
    const cookie = await loginCookie();
    expect(await (await call("/api/spazio", {}, cookie)).json()).toEqual({ demo: false });
    const ctx = createExecutionContext();
    const r = await app.fetch(new Request("https://test.local/api/spazio", { headers: { cookie } }), { ...env, SPAZIO: "demo" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(await r.json()).toEqual({ demo: true });
  });
  it("in demo ogni integrazione dice Spazio demo", async () => {
    await createUser();
    const cookie = await loginCookie();
    const ctx = createExecutionContext();
    const r = await app.fetch(new Request("https://test.local/api/integrations/status", { headers: { cookie } }), { ...env, SPAZIO: "demo" }, ctx);
    await waitOnExecutionContext(ctx);
    const s = await r.json<{ integrazioni: { stato: string; nota: string }[] }>();
    expect(s.integrazioni.length).toBeGreaterThan(0);
    expect(s.integrazioni.every((i) => i.stato === "spento" && i.nota === "Spazio demo")).toBe(true);
  });
  it("in demo il foglio non si legge (nessun dato vero entra)", async () => {
    await createUser();
    const cookie = await loginCookie();
    for (const [metodo, percorso] of [["POST", "/api/integrations/foglio/leggi"], ["GET", "/api/integrations/foglio/anteprima"]]) {
      const ctx = createExecutionContext();
      const r = await app.fetch(new Request(`https://test.local${percorso}`, { method: metodo, headers: { cookie } }), { ...env, SPAZIO: "demo" }, ctx);
      await waitOnExecutionContext(ctx);
      expect(r.status).toBe(409);
      expect((await r.json<{ error: string }>()).error).toContain("spazio demo");
    }
  });
  it("401 senza sessione", async () => {
    expect((await call("/api/spazio")).status).toBe(401);
  });
});

describe("coach della demo", () => {
  it("il risultato ha la forma salvata dal coach (Task 8)", () => {
    const d = datiDemo(ORA, "hash");
    for (const a of d.callAnalyses) {
      const { prossimaAzioneAt, ...resto } = JSON.parse(a.result!);
      expect(RisultatoCoach.safeParse(resto).success).toBe(true);
      expect(typeof prossimaAzioneAt).toBe("number");
      expect(d.calls.some((c) => c.id === a.callId && c.leadId === a.leadId)).toBe(true);
    }
  });
});
