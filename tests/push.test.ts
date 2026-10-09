import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { b64u, cifra, daB64u, intestazioneVapid } from "../worker/push/cifra";
import { setPushFetch } from "../worker/push/fetcher";
import { mandaPush } from "../worker/push/invio";
import { provaPush } from "../worker/push/routes";
import { consegnaPush } from "../worker/avvisi/consegna";
import { avvisa } from "../worker/avvisi/service";
import { LAVORI } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { contaD1 } from "../worker/lib/bilancio";
import { call, createUser, loginCookie } from "./helpers";
import { RFC8291 } from "./rfc8291";

const enc = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8));
}

// Il telefono: chiavi del ricevente e decifratura secondo RFC 8291, scritta qui in modo indipendente.
async function telefono() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  async function decifra(corpo: Uint8Array) {
    const salt = corpo.slice(0, 16);
    const idlen = corpo[20];
    const asPub = corpo.slice(21, 21 + idlen);
    const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, kp.privateKey, 256));
    const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...pub, ...asPub]);
    const ikm = await hkdf(auth, ecdh, info, 32);
    const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
    const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const chiaro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, corpo.slice(21 + idlen)));
    return new TextDecoder().decode(chiaro.slice(0, chiaro.lastIndexOf(2)));
  }
  return { p256dh: b64u(pub), auth: b64u(auth), decifra };
}

// Chiavi VAPID generate al volo: nel repo e in vitest.config.ts non c'è nessuna chiave.
async function chiaviVapid() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { pubblica: b64u(pub), privata: jwk.d!, verifica: kp.publicKey };
}

afterEach(() => setPushFetch(null));

describe("cifratura aes128gcm (RFC 8291)", () => {
  it("il telefono decifra quello che il server cifra", async () => {
    const t = await telefono();
    const corpo = await cifra(enc.encode("Quando divento grande voglio essere un'anguria"), t.p256dh, t.auth);
    expect(await t.decifra(corpo)).toBe("Quando divento grande voglio essere un'anguria");
  });

  it("intestazione: salt di 16 byte, record di 4096, chiave del server di 65 byte", async () => {
    const t = await telefono();
    const corpo = await cifra(enc.encode("x"), t.p256dh, t.auth, { salt: new Uint8Array(16).fill(7) });
    expect([...corpo.slice(0, 16)]).toEqual(new Array(16).fill(7));
    expect(new DataView(corpo.buffer).getUint32(16)).toBe(4096);
    expect(corpo[20]).toBe(65);
    expect(corpo[21]).toBe(4); // punto non compresso
  });

  it("vettore noto della RFC 8291 (sezione 5)", async () => {
    const V = RFC8291;
    const asPub = daB64u(V.asPublic);
    const privata = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: V.asPrivate, x: b64u(asPub.slice(1, 33)), y: b64u(asPub.slice(33, 65)), ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const corpo = await cifra(enc.encode(V.testo), V.uaPublic, V.authSecret, { salt: daB64u(V.salt), server: { pubblica: asPub, privata } });
    expect(b64u(corpo)).toBe(V.messaggio);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("JWT firmato ES256 con aud dell'endpoint e scadenza entro 24 ore", async () => {
    const v = await chiaviVapid();
    const h = await intestazioneVapid("https://fcm.googleapis.com/fcm/send/abc", v.pubblica, v.privata, "https://os.esempio.it", 1_800_000_000_000);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(k).toBe(v.pubblica);
    const [testa, corpo, firma] = jwt.split(".");
    const dati = JSON.parse(new TextDecoder().decode(daB64u(corpo)));
    expect(dati.aud).toBe("https://fcm.googleapis.com");
    expect(dati.exp - 1_800_000_000).toBeLessThanOrEqual(86_400);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, v.verifica, daB64u(firma), enc.encode(`${testa}.${corpo}`));
    expect(ok).toBe(true);
  });
});

describe("invio di una push", () => {
  it("cifra il corpo, firma VAPID e il telefono legge il messaggio", async () => {
    const v = await chiaviVapid();
    const t = await telefono();
    let visto: { url: string; init?: RequestInit } | null = null;
    setPushFetch(async (url, init) => { visto = { url, init }; return new Response("", { status: 201 }); });
    const esito = await mandaPush({ ...env, VAPID_PUBLIC_KEY: v.pubblica, VAPID_PRIVATE_KEY: v.privata }, { endpoint: "https://push.esempio.it/a", ...t }, { titolo: "Lead nuovo", href: "/lead/1" }, 1000);
    expect(esito).toBe("ok");
    const h = new Headers(visto!.init!.headers);
    expect(h.get("Content-Encoding")).toBe("aes128gcm");
    expect(h.get("Authorization")).toMatch(/^vapid t=.+, k=/);
    expect(JSON.parse(await t.decifra(new Uint8Array(visto!.init!.body as Uint8Array)))).toEqual({ titolo: "Lead nuovo", href: "/lead/1" });
  });

  it("chiavi del telefono rovinate: errore, mai un'eccezione", async () => {
    const v = await chiaviVapid();
    setPushFetch(async () => new Response("", { status: 201 }));
    const esito = await mandaPush({ ...env, VAPID_PUBLIC_KEY: v.pubblica, VAPID_PRIVATE_KEY: v.privata }, { endpoint: "https://push.esempio.it/a", p256dh: "BA", auth: "AA" }, { titolo: "x" }, 1000);
    expect(esito).toBe("errore");
  });
});

describe("consegna dal giro", () => {
  let v: Awaited<ReturnType<typeof chiaviVapid>>;
  let e: typeof env;
  beforeEach(async () => {
    await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
    await createUser("diego", "password-lunga-2", "Diego Simoncini");
    v = await chiaviVapid();
    e = { ...env, VAPID_PUBLIC_KEY: v.pubblica, VAPID_PRIVATE_KEY: v.privata };
  });

  async function iscrivi(user: string, endpoint: string) {
    const t = await telefono();
    await env.DB.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, etichetta, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'iPhone', 0)")
      .bind(crypto.randomUUID(), user, endpoint, t.p256dh, t.auth).run();
    return t;
  }

  it("410 cancella l'iscrizione, 3 errori di fila la segnano rotta", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/sparita");
    await iscrivi("diego", "https://push.esempio.it/rotta");
    await env.DB.prepare("UPDATE push_subscriptions SET errori = 2 WHERE endpoint LIKE '%rotta'").run();
    setPushFetch(async (url) => new Response("", { status: url.endsWith("sparita") ? 410 : 500 }));
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L1", titolo: "Lead nuovo: Officina Prova" }, 1000);
    await consegnaPush(e, 2000, 10);
    const righe = await env.DB.prepare("SELECT endpoint, rotta FROM push_subscriptions").all<{ endpoint: string; rotta: number }>();
    expect(righe.results).toEqual([{ endpoint: "https://push.esempio.it/rotta", rotta: 1 }]);
  });

  it("una consegna riuscita azzera gli errori e segna l'ora", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    await env.DB.prepare("UPDATE push_subscriptions SET errori = 2").run();
    setPushFetch(async () => new Response("", { status: 201 }));
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L9", titolo: "x", responsabile: "tommaso" }, 1000);
    expect(await consegnaPush(e, 2000, 10)).toEqual({ inviate: 1, saltate: 0 });
    expect(await env.DB.prepare("SELECT errori, last_ok_at FROM push_subscriptions").first()).toEqual({ errori: 0, last_ok_at: 2000 });
    expect(await env.DB.prepare("SELECT push_at FROM notifications").first()).toEqual({ push_at: 2000 });
  });

  it("al massimo 10 push per giro, le altre al giro dopo", async () => {
    for (let i = 0; i < 6; i++) await iscrivi("tommaso", `https://push.esempio.it/t${i}`);
    for (let i = 0; i < 6; i++) await iscrivi("diego", `https://push.esempio.it/d${i}`);
    let chiamate = 0;
    setPushFetch(async () => { chiamate++; return new Response("", { status: 201 }); });
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L2", titolo: "Lead nuovo" }, 1000);
    await consegnaPush(e, 2000, 10);
    expect(chiamate).toBeLessThanOrEqual(10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE push_at IS NULL").first<{ n: number }>())?.n).toBe(1);
    await consegnaPush(e, 3000, 10);
    expect(chiamate).toBe(12);
  });

  it("ore di silenzio: niente push, l'avviso in app resta", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    await env.DB.prepare(`UPDATE users SET quiet_hours = '{"attive":true,"da":"00:00","a":"23:59"}' WHERE id = 'tommaso'`).run();
    let chiamate = 0;
    setPushFetch(async () => { chiamate++; return new Response("", { status: 201 }); });
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L3", titolo: "x", responsabile: "tommaso" }, 1000);
    await consegnaPush(e, 2000, 10);
    expect(chiamate).toBe(0);
    const n = await env.DB.prepare("SELECT closed_at, push_at FROM notifications").first<{ closed_at: number | null; push_at: number }>();
    expect(n).toEqual({ closed_at: null, push_at: 2000 });
  });

  it("evento spento nel profilo o avviso vecchio di 6 ore: si salta senza mandare", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    await env.DB.prepare(`UPDATE users SET notify_prefs = '{"sla_90":false}' WHERE id = 'tommaso'`).run();
    let chiamate = 0;
    setPushFetch(async () => { chiamate++; return new Response("", { status: 201 }); });
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L5", titolo: "x", responsabile: "tommaso" }, 1000);
    await avvisa(getDb(env.DB), { evento: "meta_48h", entityId: "M1", titolo: "x" }, 1000, ["tommaso"]);
    const r = await consegnaPush(e, 1000 + 7 * 3_600_000, 10);
    expect(chiamate).toBe(0);
    expect(r).toEqual({ inviate: 0, saltate: 2 });
  });

  it("3 dispositivi per tommaso e 1 per diego, un sla_90 a testa, limite 2: parte l'avviso di Diego", async () => {
    for (let i = 0; i < 3; i++) await iscrivi("tommaso", `https://push.esempio.it/t${i}`);
    await iscrivi("diego", "https://push.esempio.it/d");
    const chiamate: string[] = [];
    setPushFetch(async (url) => { chiamate.push(url); return new Response("", { status: 201 }); });
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "A", titolo: "x", responsabile: "tommaso" }, 1000);
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "B", titolo: "x", responsabile: "diego" }, 1001);
    expect(await consegnaPush(e, 2000, 2)).toEqual({ inviate: 1, saltate: 0 });
    expect(chiamate).toEqual(["https://push.esempio.it/d"]);
    expect(await env.DB.prepare("SELECT user_id FROM notifications WHERE push_at IS NULL").all()).toMatchObject({ results: [{ user_id: "tommaso" }] });
  });

  it("un avviso già letto in app non parte come push", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    let chiamate = 0;
    setPushFetch(async () => { chiamate++; return new Response("", { status: 201 }); });
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L7", titolo: "x", responsabile: "tommaso" }, 1000);
    await env.DB.prepare("UPDATE notifications SET read_at = 1500").run();
    expect(await consegnaPush(e, 2000, 10)).toEqual({ inviate: 0, saltate: 0 });
    expect(chiamate).toBe(0);
  });

  it("503 poi 201: l'avviso resta in coda e parte al giro dopo", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    let stato = 503;
    setPushFetch(async () => new Response("", { status: stato }));
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L8", titolo: "x", responsabile: "tommaso" }, 1000);
    await consegnaPush(e, 2000, 10);
    expect(await env.DB.prepare("SELECT push_at FROM notifications").first()).toEqual({ push_at: null });
    expect(await env.DB.prepare("SELECT errori FROM push_subscriptions").first()).toEqual({ errori: 1 });
    stato = 201;
    await consegnaPush(e, 3000, 10);
    expect(await env.DB.prepare("SELECT push_at FROM notifications").first()).toEqual({ push_at: 3000 });
    expect(await env.DB.prepare("SELECT errori, last_ok_at FROM push_subscriptions").first()).toEqual({ errori: 0, last_ok_at: 3000 });
  });

  it("429: si ritenta al giro dopo senza contare un errore, fino a 6 ore", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    setPushFetch(async () => new Response("", { status: 429 }));
    await avvisa(getDb(env.DB), { evento: "sla_90", entityId: "L10", titolo: "x", responsabile: "tommaso" }, 1000);
    await consegnaPush(e, 2000, 10);
    expect(await env.DB.prepare("SELECT push_at FROM notifications").first()).toEqual({ push_at: null });
    expect(await env.DB.prepare("SELECT errori FROM push_subscriptions").first()).toEqual({ errori: 0 });
    await consegnaPush(e, 1000 + 7 * 3_600_000, 10);
    expect(await env.DB.prepare("SELECT push_at FROM notifications").first()).toEqual({ push_at: 1000 + 7 * 3_600_000 });
  });

  it("TTL di 6 ore sulla push", async () => {
    const t = await telefono();
    let ttl: string | null = null;
    setPushFetch(async (_u, init) => { ttl = new Headers(init?.headers).get("TTL"); return new Response("", { status: 201 }); });
    await mandaPush(e, { endpoint: "https://push.esempio.it/a", ...t }, { titolo: "x" }, 1000);
    expect(ttl).toBe("21600");
  });

  it("prova: un 410 cancella il dispositivo, un 500 conta un errore", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/sparita");
    await iscrivi("tommaso", "https://push.esempio.it/giu");
    setPushFetch(async (url) => new Response("", { status: url.endsWith("sparita") ? 410 : 500 }));
    const r = await provaPush({ env: e, userId: "tommaso" });
    expect(r).toMatchObject({ stato: 200, corpo: { inviate: 0, totale: 2 } });
    expect((await env.DB.prepare("SELECT endpoint, errori FROM push_subscriptions").all()).results).toEqual([{ endpoint: "https://push.esempio.it/giu", errori: 1 }]);
  });

  it("senza chiavi VAPID non manda niente e non segna errori", async () => {
    await iscrivi("tommaso", "https://push.esempio.it/t");
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L4", titolo: "x" }, 1000);
    const r = await consegnaPush({ ...env, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" }, 2000, 10);
    expect(r.inviate).toBe(0);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE push_at IS NULL").first<{ n: number }>())?.n).toBe(2);
  });

  it("costo misurato: mai oltre le fisse più 2 query a unità del giro", async () => {
    const def = LAVORI.consegna!;
    expect(def).toMatchObject({ fisse: 3, perUnita: 2, sottoPerUnita: 1, max: 10 });
    // Caso peggiore per le query: un dispositivo per persona e tanti avvisi, metà da saltare.
    await iscrivi("tommaso", "https://push.esempio.it/t");
    await env.DB.prepare(`UPDATE users SET notify_prefs = '{"meta_48h":false}' WHERE id = 'diego'`).run();
    for (let i = 0; i < 12; i++) await avvisa(getDb(env.DB), { evento: i % 2 ? "meta_48h" : "lead_nuovo", entityId: `C${i}`, titolo: "x" }, 1000 + i);
    setPushFetch(async () => new Response("", { status: 201 }));
    const c = { query: 0 };
    const r = await consegnaPush({ ...e, DB: contaD1(env.DB, c) }, 2000, def.max);
    expect(r.inviate).toBeLessThanOrEqual(def.max);
    expect(c.query).toBeLessThanOrEqual(def.fisse + def.perUnita * def.max);
    // Niente da consegnare: una query sola.
    const c2 = { query: 0 };
    await consegnaPush({ ...e, DB: contaD1(env.DB, c2) }, 2000, 0);
    expect(c2.query).toBeLessThanOrEqual(def.fisse);
  });
});

describe("rotte delle iscrizioni", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/push-subscriptions")).status).toBe(401);
    expect((await call("/api/push-subscriptions", { method: "POST", json: {} })).status).toBe(401);
    expect((await call("/api/push-subscriptions/chiave")).status).toBe(401);
  });

  it("salva, elenca e cancella solo le mie", async () => {
    await createUser("tommaso", "password-lunga-1");
    await createUser("diego", "password-lunga-2");
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    const altro = await loginCookie("diego", "password-lunga-2");
    const r = await call("/api/push-subscriptions", { method: "POST", json: { endpoint: "https://push.esempio.it/x", keys: { p256dh: "BA", auth: "AA" }, etichetta: "Mac, Safari" } }, cookie);
    expect(r.status).toBe(201);
    const { id } = await r.json<{ id: string }>();
    const elenco = await (await call("/api/push-subscriptions", {}, cookie)).json<{ dispositivi: { id: string; etichetta: string }[] }>();
    expect(elenco.dispositivi.map((d) => d.etichetta)).toEqual(["Mac, Safari"]);
    expect((await (await call("/api/push-subscriptions", {}, altro)).json<{ dispositivi: unknown[] }>()).dispositivi).toEqual([]);
    await call(`/api/push-subscriptions/${id}`, { method: "DELETE" }, altro);
    expect((await env.DB.prepare("SELECT count(*) n FROM push_subscriptions").first<{ n: number }>())?.n).toBe(1);
    expect((await call(`/api/push-subscriptions/${id}`, { method: "DELETE" }, cookie)).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) n FROM push_subscriptions").first<{ n: number }>())?.n).toBe(0);
  });

  it("lo stesso endpoint riscritto aggiorna la riga e la riassegna", async () => {
    await createUser("tommaso", "password-lunga-1");
    await createUser("diego", "password-lunga-2");
    const corpo = { endpoint: "https://push.esempio.it/x", keys: { p256dh: "BA", auth: "AA" }, etichetta: "iPhone" };
    const a = await (await call("/api/push-subscriptions", { method: "POST", json: corpo }, await loginCookie("tommaso", "password-lunga-1"))).json<{ id: string }>();
    const b = await (await call("/api/push-subscriptions", { method: "POST", json: corpo }, await loginCookie("diego", "password-lunga-2"))).json<{ id: string }>();
    expect(b.id).toBe(a.id);
    expect(await env.DB.prepare("SELECT user_id FROM push_subscriptions").first()).toEqual({ user_id: "diego" });
  });

  it("indirizzo non https o dati mancanti: 400 con la chiave error", async () => {
    const cookie = await (async () => { await createUser(); return loginCookie(); })();
    const r = await call("/api/push-subscriptions", { method: "POST", json: { endpoint: "http://push.esempio.it/x", keys: { p256dh: "BA", auth: "AA" }, etichetta: "x" } }, cookie);
    expect(r.status).toBe(400);
    expect(await r.json()).toHaveProperty("error");
  });

  it("chiave pubblica: null senza VAPID, la prova risponde 409 senza errori rossi", async () => {
    await createUser();
    const cookie = await loginCookie();
    expect(await (await call("/api/push-subscriptions/chiave", {}, cookie)).json()).toEqual({ chiave: null });
    const p = await call("/api/integrations/push/prova", { method: "POST", json: {} }, cookie);
    expect(p.status).toBe(409);
    expect(await p.json()).toHaveProperty("error");
    const s = await (await call("/api/integrations/status", {}, cookie)).json<{ integrazioni: { key: string; stato: string; nota: string }[] }>();
    expect(s.integrazioni.find((i) => i.key === "push")).toMatchObject({ stato: "spento", nota: "Non collegato: mancano le chiavi VAPID" });
  });
});
