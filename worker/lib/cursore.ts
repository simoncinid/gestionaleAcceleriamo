// Cursore delle liste a pagine ordinate per (created_at, id), dal più recente. Più voci possono avere lo stesso
// istante (scadiProposte ne scrive fino a 20 con lo stesso now): con il solo istante, quelle a cavallo di pagina
// si perderebbero. Formato "at:id"; un numero da solo (vecchio formato) vale come "prima di questo istante".
export type Cursore = { at: number; id: string };

export const FINE: Cursore = { at: Number.MAX_SAFE_INTEGER, id: "" };

export function leggiCursore(s: string | undefined | null): Cursore | null {
  if (s == null || s === "") return FINE;
  const i = s.indexOf(":");
  const at = Number(i < 0 ? s : s.slice(0, i));
  if (!Number.isSafeInteger(at) || at <= 0) return null;
  return { at, id: i < 0 ? "" : s.slice(i + 1, i + 101) };
}

export const scriviCursore = (v: { at: number; id: string }) => `${v.at}:${v.id}`;

// Condizione SQL: dopo il cursore nell'ordine "created_at DESC, id DESC". id vuoto: tutto l'istante è escluso.
export const dopoCursore = (col: string, idCol: string, pAt: string, pId: string) =>
  `(${col} < ${pAt} OR (${col} = ${pAt} AND ${idCol} < ${pId}))`;

// Ordine del merge in memoria, uguale a quello delle query.
export const piuRecente = (x: { at: number; id: string }, y: { at: number; id: string }) =>
  y.at - x.at || (y.id < x.id ? -1 : y.id > x.id ? 1 : 0);
