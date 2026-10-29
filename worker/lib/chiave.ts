// Confronto di una chiave con quella attesa a tempo costante: si confrontano le impronte SHA-256 (stessa lunghezza)
// byte per byte, senza uscire prima. Chiave attesa vuota o assente: sempre falso.
export async function chiaveGiusta(data: string | undefined | null, attesa: string | undefined) {
  if (!data || !attesa) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(data)), crypto.subtle.digest("SHA-256", enc.encode(attesa))]).then((d) => d.map((x) => new Uint8Array(x)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
