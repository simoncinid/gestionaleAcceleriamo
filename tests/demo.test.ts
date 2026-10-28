import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AUTOMAZIONI_SETTORE, datiDemo, istruzioniBase, sqlDemo, TABELLE_BASE } from "../scripts/demo-dati";
import { app } from "../worker/app";
import { RisultatoCoach } from "../worker/claude/coach";
import { hashPassword } from "../worker/auth/password";
import { LEAD_SOURCES, LOST_REASONS } from "../worker/db/schema";
import { MOTIVI_PERSI } from "../worker/processo/motivi";
import { call, createUser, loginCookie } from "./helpers";

const ORA = Date.UTC(2026, 9, 15, 9);

async function semina() {
  const sql = sqlDemo(datiDemo(ORA, await hashPassword("password-demo-1", 1000)));
  await env.DB.batch(sql.map((s) => env.DB.prepare(s)));
}

describe("dati della demo", () => {
  it("14 lead di settori veri, contatti finti, un'automazione anonima", () => {
    const d = datiDemo(ORA, "hash");
    expect(d.leads).toHaveLength(14);
    expect(new Set(d.leads.map((l) => l.notes)).size).toBeGreaterThanOrEqual(5);
    expect(d.leads.every((l) => l.email == null || l.email.endsWith("@esempio.invalid"))).toBe(true);
    expect(d.leads.every((l) => l.phone == null || l.phone.startsWith("+39 000"))).toBe(true);
    expect(d.automations).toHaveLength(1);
    expect(d.automations.every((a) => !d.clients.some((c) => a.name.includes(c.name)))).toBe(true);
    expect(d.companyProfiles.length).toBeGreaterThanOrEqual(2);
    expect(d.callAnalyses.length).toBeGreaterThanOrEqual(2);
    expect(datiDemo(ORA, "hash")).toEqual(d);
  });
  it("lavori finti dei clienti attivi: task dell'utente demo, ricorrenti del mese e passaggi dell'automazione", () => {
    const d = datiDemo(ORA, "hash");
    expect(d.jobs).toHaveLength(1);
    expect(d.jobs.every((j) => d.clients.some((c) => c.id === j.clientId) && j.templateId === "lt-automazione-su-misura")).toBe(true);
    expect(d.tasks.every((t) => t.assigneeId === "demo" && d.jobs.some((j) => j.id === t.jobId))).toBe(true);
    expect(d.tasks.some((t) => t.doneAt == null)).toBe(true);
    expect(d.tasks.filter((t) => t.month === "2026-10").length).toBeGreaterThanOrEqual(2);
    expect(d.automationSteps.length).toBeGreaterThan(0);
  });
  it("valori ammessi dallo schema: fonti, motivi di perdita, siti su esempio.invalid", () => {
    const d = datiDemo(ORA, "hash");
    expect(d.leads.every((l) => (LEAD_SOURCES as readonly string[]).includes(l.source!))).toBe(true);
    // Blocco 1: i motivi a codice (MOTIVI_PERSI) accanto a quelli vecchi di Impostazioni.
    const motivi = [...LOST_REASONS, ...MOTIVI_PERSI.map((m) => m.id)] as string[];
    expect(d.leads.every((l) => l.lostReason == null || motivi.includes(l.lostReason))).toBe(true);
    expect(d.leads.every((l) => l.website == null || new URL(l.website).hostname.endsWith(".esempio.invalid"))).toBe(true);
  });
  it("nessun dominio vero: niente esempio.it in email, siti e testi", () => {
    expect(sqlDemo(datiDemo(ORA, "hash")).join("\n")).not.toMatch(/esempio\.it\b/);
  });
  it("le automazioni dei clienti finti sono del loro settore", () => {
    const d = datiDemo(ORA, "hash");
    for (const a of d.automations) {
      const cliente = d.clients.find((c) => c.id === a.clientId)!;
      expect(AUTOMAZIONI_SETTORE[cliente.sector!].map(([n]) => n)).toContain(a.name);
    }
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
    expect(n).toEqual({ l: 14, u: 2, a: 1 });
    // Gli a capo della scheda tornano a capo veri dopo char(10).
    const scheda = await env.DB.prepare("SELECT content FROM company_profiles LIMIT 1").first<{ content: string }>();
    expect(scheda?.content).toContain("\n## Cosa fa l'azienda");
  });
  it("il ripristino rimette fasi, regole, modelli e impostazioni come dopo le migrazioni", async () => {
    const leggi = async () => Object.fromEntries(await Promise.all(TABELLE_BASE.map(async (t) => [t, (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()).results] as const)));
    const prima = await leggi();
    expect((prima.stages as unknown[]).length).toBeGreaterThan(0);
    await env.DB.batch([
      env.DB.prepare("UPDATE stages SET label = 'Fase rovinata', probability = 1"),
      env.DB.prepare("DELETE FROM stage_rules WHERE rule_key = 'sla'"),
      env.DB.prepare("UPDATE message_templates SET body = 'testo del visitatore'"),
      env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('claude', '{\"tettoMensile\":1}', 0)"),
    ]);
    const base = istruzioniBase(env.TEST_MIGRATIONS.flatMap((m) => m.queries));
    expect(base.every((q) => !q.includes("\n"))).toBe(true);
    const sql = sqlDemo(datiDemo(ORA, await hashPassword("password-demo-1", 1000)), base);
    await env.DB.batch(sql.map((q) => env.DB.prepare(q)));
    // Blocco 1: il seed scrive anche l'assegnazione (prima chiamata a Diego, presentazione a Tommaso); il resto torna come prima.
    const dopo = await leggi();
    expect((dopo.settings as { key: string }[]).map((r) => r.key)).toEqual(["assegnazione"]);
    expect({ ...dopo, settings: prima.settings }).toEqual(prima);
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
  it("i link Meet della demo puntano a un dominio che non esiste (review 14a, minore 7)", () => {
    const d = datiDemo(ORA, "hash");
    for (const c of d.calls) if (c.meetLink) expect(c.meetLink.startsWith("https://meet.esempio.invalid/")).toBe(true);
  });
});
