import type { RispCampagna } from "../db/schema";

/** Minuscole, accenti tolti, tutto ciò che non è lettera o cifra diventa spazio. */
export function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Parola intera sui token; una parola di più termini è una sequenza di token. */
export function contieneParola(testo: string, parola: string): boolean {
  const cerca = normalizza(parola);
  if (!cerca) return false;
  return ` ${normalizza(testo)} `.includes(` ${cerca} `);
}

/** Solo attive con la parola nel testo; prima quelle del post, poi le generali; a parità la più recente. */
export function scegliCampagna(campagne: RispCampagna[], mediaId: string, testo: string): RispCampagna | null {
  const valide = campagne.filter((c) => c.attiva && contieneParola(testo, c.parola));
  const piuRecente = (lista: RispCampagna[]) => lista.reduce<RispCampagna | null>((m, c) => (!m || c.creataIl > m.creataIl ? c : m), null);
  return piuRecente(valide.filter((c) => c.mediaId === mediaId)) ?? piuRecente(valide.filter((c) => c.mediaId === null));
}
