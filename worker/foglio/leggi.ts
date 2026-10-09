import { googleFetch } from "./fetcher";

// Via alternativa (account di servizio): una sola chiamata batchGet per giro, intestazione, riga di controllo e righe nuove insieme.
export async function leggiIntervalli(token: string, spreadsheetId: string, scheda: string, intervalli: [number, number][]): Promise<string[][][]> {
  const q = new URLSearchParams();
  for (const [da, a] of intervalli) q.append("ranges", `'${scheda.replace(/'/g, "''")}'!A${da}:Z${a}`);
  q.set("majorDimension", "ROWS");
  const r = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${q}`, { headers: { authorization: `Bearer ${token}` } });
  const j = (await r.json().catch(() => ({}))) as { valueRanges?: { values?: string[][] }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`Google ${r.status}: ${j.error?.message ?? "errore senza messaggio"}`);
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

export const NON_CONDIVISO = "Il foglio non è condiviso con chiunque abbia il link";
export const NON_TROVATO = "Foglio non trovato: controlla l'id del foglio";

// Via principale: il foglio condiviso "chiunque abbia il link" esportato in CSV, senza credenziali.
// headers=1 dice a Google che l'intestazione è solo la prima riga (altrimenti a volte ne unisce più d'una).
export async function leggiCsv(spreadsheetId: string, scheda: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(scheda)}`;
  const r = await googleFetch(url);
  if (r.status === 404) throw new Error(NON_TROVATO);
  if (!r.ok) throw new Error(NON_CONDIVISO);
  const corpo = (await r.text()).replace(/^﻿/, "");
  // Un foglio privato non dà errore: Google risponde 200 con la pagina di accesso.
  if ((r.headers.get("content-type") ?? "").includes("text/html") || /^\s*</.test(corpo)) throw new Error(NON_CONDIVISO);
  return parseCsv(corpo);
}
