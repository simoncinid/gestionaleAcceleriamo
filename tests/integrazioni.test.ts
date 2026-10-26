import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../worker/app";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { meseRoma } from "../worker/lib/roma";
import { authed, call } from "./helpers";

type Stato = { integrazioni: { key: string; stato: string; nota: string | null }[]; settimana: { meta: number; foglio: number; aggancio: number }; errori: { key: string; errorId: string | null }[]; segreti: Record<string, boolean> };
const stato = async (cookie: string) => (await (await call("/api/integrations/status", {}, cookie)).json()) as Stato;
const voce = (s: Stato, k: string) => s.integrazioni.find((i) => i.key === k)!;

// Come call(), ma con un ambiente diverso (segreti mancanti).
async function callCon(altro: Partial<Env>, path: string, init: RequestInit, cookie: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://test.local${path}`, { ...init, headers: { cookie } }), { ...env, ...altro }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const SENZA_SEGRETI: Partial<Env> = { RESEND_API_KEY: "", PROPOSAL_HOOK_KEY: "", META_PAGE_TOKEN: "", META_APP_SECRET: "", GOOGLE_SA_EMAIL: "", GOOGLE_SA_PRIVATE_KEY: "" };

afterEach(() => { setEmailFetch(null); setGoogleFetch(null); });

describe("Impostazioni, integrazioni", () => {
  it("serve l'accesso", async () => {
    for (const p of ["/api/integrations/status", "/api/integrations/aggancio/registro", "/api/integrations/foglio/anteprima"]) expect((await call(p)).status).toBe(401);
  });

  it("stato: non collegate, mai partite, errori col codice, numeri della settimana, segreti solo presenti o mancanti", async () => {
    const cookie = await authed();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO integration_status (key, ok, last_ok_at, last_error_at, last_error, error_id) VALUES ('resend', 0, ?, ?, 'Resend 500: errore finto', 'ab12cd34')").bind(now - 86_400_000, now - 60_000).run();
    await env.DB.prepare("INSERT INTO leads (id, company, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('f1', 'Officina Prova', 'foglio_andrea', 'da-chiamare-prima-volta', ?1, ?1, ?1)").bind(now).run();
    const s = await stato(cookie);
    expect(s.integrazioni.map((i) => i.key)).toEqual(["meta", "foglio", "aggancio", "posta", "resend", "push", "telegram", "claude", "giro"]);
    expect(voce(s, "foglio")).toMatchObject({ stato: "spento", nota: "Non collegato: manca il link del foglio" });
    expect(voce(s, "giro").stato).toBe("mai");
    expect(voce(s, "push").stato).toBe("spento");
    expect(voce(s, "resend")).toMatchObject({ stato: "errore", nota: "Resend 500: errore finto" });
    expect(s.errori[0]).toMatchObject({ key: "resend", errorId: "ab12cd34" });
    expect(s.settimana.foglio).toBe(1);
    expect(s.segreti).toMatchObject({ resend: true, google: false, aggancio: true, meta: true });
    expect(JSON.stringify(s)).not.toContain("re_test");
    expect(JSON.stringify(s)).not.toContain("chiave-aggancio-test");
  });

  it("senza segreti: tutto non collegato, nessun rosso, nemmeno con un vecchio errore registrato", async () => {
    const cookie = await authed();
    await env.DB.prepare("INSERT INTO integration_status (key, ok, last_error_at, last_error, error_id) VALUES ('resend', 0, 1, 'Resend 401: chiave finta', 'ab12cd34')").run();
    const s = (await (await callCon(SENZA_SEGRETI, "/api/integrations/status", {}, cookie)).json()) as Stato;
    for (const k of ["meta", "foglio", "aggancio", "resend"]) expect(voce(s, k).stato).toBe("spento");
    expect(voce(s, "resend").nota).toBe("Non collegato: manca la chiave di Resend");
    expect(voce(s, "aggancio").nota).toBe("Non collegato: manca la chiave dell'aggancio");
    expect(voce(s, "meta").nota).toBe("Non collegato: mancano i segreti di Meta");
    expect(s.errori.map((e) => e.key)).not.toContain("resend");
  });

  it("Claude: senza chiave non collegato; con la chiave stato dei lavori, speso del mese e tetto in centesimi", async () => {
    const cookie = await authed();
    await env.DB.prepare("INSERT INTO integration_status (key, ok, last_error_at, last_error, error_id) VALUES ('claude', 0, 1, 'Lavori di Claude non riusciti', 'cd34ef56')").run();
    const senza = (await (await callCon({ ANTHROPIC_API_KEY: "" }, "/api/integrations/status", {}, cookie)).json()) as Stato;
    expect(voce(senza, "claude")).toMatchObject({ stato: "spento", nota: "Non collegato: manca la chiave di Anthropic" });
    expect(senza.errori.map((e) => e.key)).not.toContain("claude");
    await env.DB.prepare("INSERT INTO claude_usage (id, tipo, modello, mese, costo_micros, created_at) VALUES ('u1', 'scheda', 'claude-sonnet-5-5', ?1, 1234567, 0)").bind(meseRoma(Date.now())).run();
    const con = await stato(cookie);
    expect(voce(con, "claude")).toMatchObject({ stato: "errore", nota: "Lavori di Claude non riusciti", extra: { spesoCents: 124, tettoCents: 2000 } });
    expect(JSON.stringify(con)).not.toContain(env.ANTHROPIC_API_KEY!);
  });

  it("email di prova: va all'indirizzo delle risposte e accende Resend", async () => {
    const cookie = await authed();
    const inviate: { to: string[] }[] = [];
    setEmailFetch(async (_url, init) => {
      inviate.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "re_1" });
    });
    const res = await call("/api/integrations/resend/prova", { method: "POST" }, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, a: "tommaso@acceleriamo.it" });
    expect(inviate[0].to).toEqual(["tommaso@acceleriamo.it"]);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 1 });
  });

  it("email di prova che fallisce: 502 col messaggio di Resend, stato rosso", async () => {
    const cookie = await authed();
    setEmailFetch(async () => Response.json({ message: "dominio non verificato" }, { status: 403 }));
    const res = await call("/api/integrations/resend/prova", { method: "POST" }, cookie);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("Resend 403: dominio non verificato");
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'resend'").first()).toEqual({ ok: 0 });
  });

  it("prove senza chiave: 409 con la spiegazione, nessuno stato rosso", async () => {
    const cookie = await authed();
    const resend = await callCon(SENZA_SEGRETI, "/api/integrations/resend/prova", { method: "POST" }, cookie);
    expect(resend.status).toBe(409);
    const aggancio = await callCon(SENZA_SEGRETI, "/api/integrations/aggancio/prova", { method: "POST" }, cookie);
    expect(aggancio.status).toBe(409);
    expect(await env.DB.prepare("SELECT count(*) n FROM integration_status").first()).toEqual({ n: 0 });
  });

  it("proposta di prova: finisce nel registro, non tocca lead né proposte, non conta nella settimana", async () => {
    const cookie = await authed();
    expect((await call("/api/integrations/aggancio/prova", { method: "POST" }, cookie)).status).toBe(200);
    const { voci } = (await (await call("/api/integrations/aggancio/registro", {}, cookie)).json()) as { voci: { outcome: string }[] };
    expect(voci[0].outcome).toBe("prova");
    expect(await env.DB.prepare("SELECT count(*) n FROM proposals").first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 0 });
    expect((await stato(cookie)).settimana.aggancio).toBe(0);
  });

  it("Leggi adesso a lettura spenta: 409 con la spiegazione", async () => {
    const cookie = await authed();
    const res = await call("/api/integrations/foglio/leggi", { method: "POST" }, cookie);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/spenta/);
  });

  it("Leggi adesso e anteprima dal CSV del link", async () => {
    const cookie = await authed();
    const csv = "Data di creazione,Azienda,Nome e Cognome,Telefono,Email,Campagna\n2026-10-12 09:10,Officina Prova,Luca Prova,+39 333 000 0011,luca@esempio.it,Autunno\n";
    const chiamate: string[] = [];
    setGoogleFetch(async (url) => { chiamate.push(url); return new Response(csv, { headers: { "content-type": "text/csv" } }); });
    setEmailFetch(async () => Response.json({ id: "re_1" }));
    const foglio = { attivo: true, spreadsheetId: "foglio-finto", scheda: "", gid: "123", mappa: { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "" } };
    expect((await call("/api/settings", { method: "PUT", json: { key: "foglio", value: foglio } }, cookie)).status).toBe(200);
    const anteprima = (await (await call("/api/integrations/foglio/anteprima", {}, cookie)).json()) as { colonneMancanti: string[]; righe: { azienda: string }[] };
    expect(anteprima.colonneMancanti).toEqual([]);
    expect(anteprima.righe[0].azienda).toBe("Officina Prova");
    expect(chiamate[0]).toContain("gid=123");
    const res = await call("/api/integrations/foglio/leggi", { method: "POST" }, cookie);
    expect(((await res.json()) as { giro: { create: number } }).giro.create).toBe(1);
  });
});
