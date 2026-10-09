// Web Push scritto a mano con Web Crypto: RFC 8291 (cifratura aes128gcm) e RFC 8292 (VAPID).
// Nessuna libreria: gira nel Worker senza polyfill.
const enc = new TextEncoder();

export function b64u(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function daB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const unisci = (...parti: Uint8Array[]) => {
  const out = new Uint8Array(parti.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parti) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, lunghezza: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, lunghezza * 8));
}

export type ChiaviServer = { pubblica: Uint8Array; privata: CryptoKey };

async function nuoveChiaviServer(): Promise<ChiaviServer> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { pubblica: new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer), privata: kp.privateKey };
}

// RFC 8291 con content coding aes128gcm (RFC 8188): un solo record, delimitatore 0x02.
// Chiavi del server nuove a ogni messaggio (salvo nei test, che passano quelle della RFC).
export async function cifra(testo: Uint8Array, p256dh: string, auth: string, opz?: { salt?: Uint8Array; server?: ChiaviServer }): Promise<Uint8Array> {
  const uaPub = daB64u(p256dh);
  const segreto = daB64u(auth);
  const salt = opz?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const server = opz?.server ?? (await nuoveChiaviServer());
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, server.privata, 256));
  const ikm = await hkdf(segreto, ecdh, unisci(enc.encode("WebPush: info\0"), uaPub, server.pubblica), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const chiave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrato = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chiave, unisci(testo, new Uint8Array([2]))));
  // Intestazione: salt (16), dimensione del record (4), lunghezza della chiave (1), chiave del server.
  const testa = new Uint8Array(21 + server.pubblica.length);
  testa.set(salt, 0);
  new DataView(testa.buffer).setUint32(16, 4096);
  testa[20] = server.pubblica.length;
  testa.set(server.pubblica, 21);
  return unisci(testa, cifrato);
}

// RFC 8292: JWT ES256 (firma grezza r||s, quella che dà Web Crypto) con aud = origine dell'endpoint, scadenza a 12 ore.
export async function intestazioneVapid(endpoint: string, pubblica: string, privata: string, soggetto: string, now: number): Promise<string> {
  const testa = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: soggetto })));
  const pub = daB64u(pubblica);
  const k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: privata, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, enc.encode(`${testa}.${corpo}`));
  return `vapid t=${testa}.${corpo}.${b64u(firma)}, k=${pubblica}`;
}
