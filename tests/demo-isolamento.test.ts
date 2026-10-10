import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import configurazione from "../wrangler.jsonc?raw";
import { app } from "../worker/app";
import { chiamaClaude, ErroreClaude } from "../worker/claude/client";
import { setClaudeFetch } from "../worker/claude/fetcher";
import { setEmailFetch } from "../worker/email/fetcher";
import { inviaEmail } from "../worker/email/resend";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { tokenGoogle } from "../worker/foglio/jwt";
import { anteprimaFoglio, giroFoglio } from "../worker/foglio/sync";
import { getDb } from "../worker/db/client";
import { NIENTE_IN_DEMO } from "../worker/lib/demo";
import { setMetaFetch } from "../worker/meta/fetcher";
import { fetchMetaLead } from "../worker/meta/ingest";
import { setPushFetch } from "../worker/push/fetcher";
import { mandaPush } from "../worker/push/invio";
import { setTelegramFetch } from "../worker/telegram/fetcher";
import { leggiCollegamenti, mandaTelegram } from "../worker/telegram/bot";
import { createUser, loginCookie } from "./helpers";

// La demo con tutte le chiavi incollate per sbaglio: nessuna chiamata deve partire lo stesso.
const demo = { ...env, SPAZIO: "demo", VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "y", GOOGLE_SA_EMAIL: "sa@prova.invalid", GOOGLE_SA_PRIVATE_KEY: "z" } as Env;
let chiamate = 0;
const conta = async () => { chiamate++; return Response.json({ ok: true, result: [] }); };
afterEach(() => {
  chiamate = 0;
  for (const s of [setEmailFetch, setPushFetch, setTelegramFetch, setClaudeFetch, setMetaFetch, setGoogleFetch]) s(null);
});

describe("demo: se è la demo, non si manda niente", () => {
  it("Resend", async () => {
    setEmailFetch(conta);
    expect(await inviaEmail(demo, { from: "a@prova.invalid", to: "b@prova.invalid", subject: "x", text: "x" })).toEqual({ ok: false, errore: NIENTE_IN_DEMO, ritentabile: false });
    expect(chiamate).toBe(0);
  });
  it("push", async () => {
    // Chiavi vere generate al volo: senza la guardia la push partirebbe davvero.
    const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const tel = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const vapid = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const p256dh = b64u(new Uint8Array((await crypto.subtle.exportKey("raw", tel.publicKey)) as ArrayBuffer));
    const chiavi = { VAPID_PUBLIC_KEY: b64u(new Uint8Array((await crypto.subtle.exportKey("raw", vapid.publicKey)) as ArrayBuffer)), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d! };
    setPushFetch(async () => { chiamate++; return new Response(null, { status: 201 }); });
    const sub = { endpoint: "https://push.prova.invalid/1", p256dh, auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
    expect(await mandaPush({ ...demo, ...chiavi }, sub, { titolo: "x" }, 0)).toBe("errore");
    expect(chiamate).toBe(0);
    expect(await mandaPush({ ...demo, ...chiavi, SPAZIO: undefined }, sub, { titolo: "x" }, 0)).toBe("ok");
    expect(chiamate).toBe(1);
    chiamate = 0;
    expect(chiamate).toBe(0);
  });
  it("Telegram, invio e lettura dei collegamenti", async () => {
    setTelegramFetch(conta);
    expect(await mandaTelegram(demo, "42", "ciao")).toBe(false);
    expect(await leggiCollegamenti(demo, [])).toEqual({ scritture: [], daRispondere: [], conferma: null, sottorichieste: 0 });
    expect(chiamate).toBe(0);
  });
  it("Claude", async () => {
    setClaudeFetch(conta);
    const e = await chiamaClaude(demo, { modello: "claude-haiku-4-5", sistema: "x", testo: "x", maxTokens: 10 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroreClaude);
    expect((e as ErroreClaude).ritentabile).toBe(false);
    expect(chiamate).toBe(0);
  });
  it("Meta", async () => {
    setMetaFetch(conta);
    await expect(fetchMetaLead(demo, "123")).rejects.toThrow(NIENTE_IN_DEMO);
    expect(chiamate).toBe(0);
  });
  it("Foglio: giro, anteprima e token", async () => {
    setGoogleFetch(conta);
    await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('foglio', '{"attivo":true,"spreadsheetId":"abc","scheda":"Foglio1","gid":"0"}', 0)`).run();
    expect(await giroFoglio(demo, 0)).toBeNull();
    await expect(anteprimaFoglio(demo, 0)).rejects.toThrow(NIENTE_IN_DEMO);
    await expect(tokenGoogle(demo, getDb(env.DB), 0)).rejects.toThrow(NIENTE_IN_DEMO);
    expect(chiamate).toBe(0);
  });
});

describe("demo: password e nome dell'utente", () => {
  const inDemo = async (percorso: string, metodo: string, corpo: unknown, cookie: string) => {
    const ctx = createExecutionContext();
    const r = await app.fetch(new Request(`https://test.local${percorso}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(corpo) }), demo, ctx);
    await waitOnExecutionContext(ctx);
    return r;
  };
  it("cambio password e nome: 409 Spazio demo; le preferenze si salvano", async () => {
    await createUser("demo", "password-demo-1", "Utente demo");
    const cookie = await loginCookie("demo", "password-demo-1");
    const p = await inDemo("/api/me/password", "POST", { attuale: "password-demo-1", nuova: "password-nuova-12" }, cookie);
    expect(p.status).toBe(409);
    expect((await p.json<{ error: string }>()).error).toMatch(/^Spazio demo/);
    expect((await inDemo("/api/me", "PATCH", { name: "Altro" }, cookie)).status).toBe(409);
    expect(await loginCookie("demo", "password-demo-1")).not.toBe("");
  });
});

// JSONC: commenti di riga e di blocco tolti fuori dalle stringhe, virgole finali tolte.
function leggiJsonc(testo: string): Record<string, unknown> {
  let out = "";
  for (let i = 0, str = false; i < testo.length; i++) {
    const c = testo[i];
    if (str) { out += c; if (c === "\\") out += testo[++i]; else if (c === '"') str = false; continue; }
    if (c === '"') { str = true; out += c; continue; }
    if (c === "/" && testo[i + 1] === "/") { while (i < testo.length && testo[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && testo[i + 1] === "*") { i = testo.indexOf("*/", i + 2) + 1; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

describe("wrangler.jsonc", () => {
  type Db = { binding: string; database_id: string };
  const w = leggiJsonc(configurazione) as { d1_databases: Db[]; triggers: { crons: string[] }; vars: Record<string, string>; env: { demo: { d1_databases: Db[]; triggers: { crons: string[] }; vars: Record<string, string> } } };
  it("la demo ha un database diverso da quello vero e nessun cron", () => {
    const vero = w.d1_databases.find((d) => d.binding === "DB")!.database_id;
    const finto = w.env.demo.d1_databases.find((d) => d.binding === "DB")!.database_id;
    expect(vero).toBeTruthy();
    expect(finto).toBeTruthy();
    expect(finto).not.toBe(vero);
    expect(w.env.demo.triggers.crons).toEqual([]);
    expect(w.env.demo.vars.SPAZIO).toBe("demo");
    expect(w.triggers.crons.length).toBeGreaterThan(0);
  });
  it("in produzione SPAZIO non c'è: l'app vera non entra mai in modalità demo (review 14a, minore b)", () => {
    expect(w.vars).toBeTruthy();
    expect("SPAZIO" in w.vars).toBe(false);
  });
});
