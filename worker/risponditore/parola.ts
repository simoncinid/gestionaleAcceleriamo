import type { RispCampagna } from "../db/schema";
import type { Env } from "../env";
import { graphGet, type Canale } from "./graph";

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

/** Candidate in ordine: solo attive con la parola nel testo; prima quelle del post, poi le generali; a parità la più recente. */
export function candidateCampagne(campagne: RispCampagna[], mediaId: string, testo: string): RispCampagna[] {
  const valide = campagne.filter((c) => c.attiva && contieneParola(testo, c.parola));
  const recenti = (lista: RispCampagna[]) => [...lista].sort((a, b) => b.creataIl - a.creataIl);
  return [...recenti(valide.filter((c) => c.mediaId === mediaId)), ...recenti(valide.filter((c) => c.mediaId === null))];
}

/** La prima candidata (vedi candidateCampagne). */
export function scegliCampagna(campagne: RispCampagna[], mediaId: string, testo: string): RispCampagna | null {
  return candidateCampagne(campagne, mediaId, testo)[0] ?? null;
}

export const MOTIVO_NON_DEL_POST = "parola non chiesta nella didascalia di questo post";

/**
 * Una campagna legata a un post risponde solo lì (lo garantisce già scegliCampagna). Una campagna senza post risponde
 * solo sotto i post la cui didascalia dice "Commenta <PAROLA>": così "tra due ore" scritto sotto un altro post non fa
 * partire nulla. La risposta di Meta si ricorda negli eventi dello stesso post (un invio riuscito o un rifiuto per questo
 * motivo), per non rileggere la didascalia a ogni commento. Didascalia non leggibile: eccezione, l'evento va in errore
 * e il giro dei ritentativi riprova (nessun invio senza conferma).
 */
export async function postDellaCampagna(env: Env, canale: Canale, campagna: RispCampagna, mediaId: string): Promise<boolean> {
  if (campagna.mediaId) return campagna.mediaId === mediaId;
  const visto = await env.DB.prepare(
    `SELECT stato FROM risp_eventi WHERE media_id = ? AND campagna_id = ? AND (stato IN ('inviato','link_inviato') OR motivo = ?) ORDER BY aggiornato_il DESC LIMIT 1`,
  ).bind(mediaId, campagna.id, MOTIVO_NON_DEL_POST).first<{ stato: string }>();
  if (visto) return visto.stato !== "ignorato";
  const campo = canale.piattaforma === "fb" ? "message" : "caption";
  const r = await graphGet(env, canale, `/${mediaId}?fields=${campo}`);
  if (!r.ok) throw new Error(`Didascalia del post non leggibile: ${r.messaggio}`.slice(0, 200));
  return contieneParola(String(r.dati?.[campo] ?? ""), `commenta ${campagna.parola}`);
}

/**
 * Fra le candidate, la prima chiesta da questo post (postDellaCampagna). Serve quando un commento contiene più parole:
 * "CARICO, ci perdo ore" sotto il reel che chiede CARICO deve far partire CARICO anche se ORE è più recente.
 * Didascalia non leggibile: eccezione, come postDellaCampagna.
 */
export async function campagnaDelPost(env: Env, canale: Canale, candidate: RispCampagna[], mediaId: string): Promise<RispCampagna | null> {
  for (const c of candidate) if (await postDellaCampagna(env, canale, c, mediaId)) return c;
  return null;
}
