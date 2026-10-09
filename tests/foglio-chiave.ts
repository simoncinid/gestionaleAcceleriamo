let cache: Promise<{ pem: string; pubblica: CryptoKey }> | null = null;

// La chiave privata in PEM con i "\n" scritti come testo, come arriva da `wrangler secret put`.
// Generata al volo a ogni esecuzione: nessuna chiave vera nel repo.
export function chiaveDiProva() {
  cache ??= (async () => {
    const k = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", k.privateKey)) as ArrayBuffer);
    const b64 = btoa(String.fromCharCode(...der));
    return { pem: `-----BEGIN PRIVATE KEY-----\\n${b64.match(/.{1,64}/g)!.join("\\n")}\\n-----END PRIVATE KEY-----\\n`, pubblica: k.publicKey };
  })();
  return cache;
}
