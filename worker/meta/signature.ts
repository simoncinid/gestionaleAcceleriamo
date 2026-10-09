const enc = new TextEncoder();

export async function computeMetaSignature(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  return `sha256=${[...sig].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function verifyMetaSignature(rawBody: string, header: string | null | undefined, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const expected = await computeMetaSignature(rawBody, secret);
  const given = header.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
