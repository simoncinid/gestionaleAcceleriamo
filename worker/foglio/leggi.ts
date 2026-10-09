import { googleFetch } from "./fetcher";

export const NON_RAGGIUNGIBILE = "Google non raggiungibile, si riprova";
export const NON_CONDIVISO = "Il foglio non è condiviso con chiunque abbia il link";
export const SCHEDA_NON_TROVATA = "Scheda non trovata: controlla il gid nel link del foglio";
export const SA_NON_CONDIVISO = "Foglio non condiviso con l'email dell'account di servizio";
export const SA_CREDENZIALI = "Credenziali dell'account di servizio non valide";

// Un fetch che lancia (rete, DNS, timeout) diventa un messaggio in italiano; il testo tecnico va nel log.
export async function chiamaGoogle(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await googleFetch(url, init);
  } catch (e) {
    console.error("google_non_raggiungibile", url.split("?")[0], (e as Error).message);
    throw new Error(NON_RAGGIUNGIBILE);
  }
}

// Via alternativa (account di servizio): una sola chiamata batchGet per giro, intestazione, riga di controllo e righe nuove insieme.
export async function leggiIntervalli(token: string, spreadsheetId: string, scheda: string, intervalli: [number, number][]): Promise<string[][][]> {
  const q = new URLSearchParams();
  for (const [da, a] of intervalli) q.append("ranges", `'${scheda.replace(/'/g, "''")}'!A${da}:Z${a}`);
  q.set("majorDimension", "ROWS");
  const r = await chiamaGoogle(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${q}`, { headers: { authorization: `Bearer ${token}` } });
  const j = (await r.json().catch(() => ({}))) as { valueRanges?: { values?: string[][] }[]; error?: { message?: string } };
  if (!r.ok) {
    console.error("google_sheets", r.status, j.error?.message);
    if (r.status === 403) throw new Error(SA_NON_CONDIVISO);
    if (r.status === 401) throw new Error(SA_CREDENZIALI);
    throw new Error(`Google ${r.status}: ${j.error?.message ?? "errore senza messaggio"}`);
  }
  return (j.valueRanges ?? []).map((v) => (v.values ?? []).map((riga) => riga.map((c) => String(c ?? ""))));
}

// CSV secondo RFC 4180: celle tra virgolette con virgole, a capo e virgolette raddoppiate.
export function parseCsv(testo: string): string[][] {
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let virgolette = false;
  let i = 0;
  while (i < testo.length) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') { cella += '"'; i += 2; continue; }
      if (c === '"') { virgolette = false; i++; continue; }
      cella += c; i++; continue;
    }
    if (c === '"') { virgolette = true; i++; continue; }
    if (c === ",") { riga.push(cella); cella = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      riga.push(cella); righe.push(riga); riga = []; cella = "";
      i += c === "\r" && testo[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cella += c; i++;
  }
  if (cella !== "" || riga.length) { riga.push(cella); righe.push(riga); }
  return righe;
}

// Via principale: il foglio condiviso "chiunque abbia il link" esportato in CSV, senza credenziali.
// L'export non tipizza le colonne (i telefoni restano come scritti) e con un gid sbagliato non ripiega sulla prima scheda.
// Il rimando a googleusercontent.com lo segue fetch da solo.
export async function leggiCsv(spreadsheetId: string, gid: string): Promise<string[][]> {
  const r = await chiamaGoogle(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`);
  if (!r.ok) {
    console.error("google_csv", r.status);
    if (r.status === 401 || r.status === 403) throw new Error(NON_CONDIVISO);
    if (r.status === 429 || r.status >= 500) throw new Error(NON_RAGGIUNGIBILE);
    throw new Error(SCHEDA_NON_TROVATA);
  }
  const corpo = (await r.text()).replace(/^\uFEFF/, "");
  // Un foglio privato non dà errore: Google risponde 200 con la pagina di accesso.
  if ((r.headers.get("content-type") ?? "").includes("text/html") || /^\s*</.test(corpo)) throw new Error(NON_CONDIVISO);
  return parseCsv(corpo);
}
