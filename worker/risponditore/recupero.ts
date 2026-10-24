import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { trattaCommento, type Commento } from "./commenti";
import { graphGet, leggiCanale, type Canale } from "./graph";

const SETTE_GIORNI = 7 * 86_400_000;
const FINESTRA_ROTAZIONE = 15 * 60_000;
// Commenti nuovi trattati per giro: ognuno costa fino a due chiamate (risposta pubblica e messaggio privato).
const NUOVI_PER_GIRO = 3;
const CHIAMATE_PER_NUOVO = 2;

// Graph dà "2026-10-19T10:00:00+0000": senza i due punti nel fuso non tutti i motori lo leggono.
function ora(ts: unknown): number | null {
  if (typeof ts !== "string") return null;
  const t = Date.parse(ts.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(t) ? null : t;
}

// Rete di sicurezza del webhook: rilegge i commenti dei post sotto campagna e tratta quelli mai visti (la deduplica
// per commento_id evita doppioni). Tocca al massimo maxPost post per giro, a rotazione: la finestra parte da un
// punto che cambia ogni 15 minuti, così giri successivi coprono post diversi senza tabelle in più.
// budget: chiamate Graph al massimo in questo giro (default due per post); il tetto non si supera mai, nemmeno di una.
// Instagram e Pagina Facebook stanno nella stessa rotazione; sulla Pagina valgono solo le campagne generali
// (il media_id di una campagna è un post Instagram).
export async function recuperaCommenti(env: Env, now: number, maxPost: number, budget = maxPost * 2): Promise<{ trovati: number; chiamate: number }> {
  const esito = { trovati: 0, chiamate: 0 };
  if (maxPost <= 0 || budget < 2) return esito;
  const entra = (n: number) => esito.chiamate + n <= budget;
  const ig = await leggiCanale(env, "ig");
  const fb = await leggiCanale(env, "fb");
  if (!ig && !fb) return esito;
  const campagne = await drizzle(env.DB).select().from(rispCampagne).where(eq(rispCampagne.attiva, true)).all();
  if (!campagne.length) return esito;
  const generali = campagne.some((c) => !c.mediaId);

  // Chiave "ig:<id>" o "fb:<id>": la piattaforma decide indirizzo e campi.
  const posti = new Map<string, { canale: Canale; id: string }>();
  const aggiungi = (canale: Canale, id: string) => posti.set(`${canale.piattaforma}:${id}`, { canale, id });
  const recenti = async (canale: Canale, percorso: string, campo: "timestamp" | "created_time") => {
    esito.chiamate++;
    const r = await graphGet(env, canale, percorso);
    if (!r.ok) return;
    for (const m of r.dati?.data ?? []) {
      const t = ora(m?.[campo]);
      if (m?.id && t !== null && now - t <= SETTE_GIORNI) aggiungi(canale, String(m.id));
    }
  };
  if (ig) {
    for (const c of campagne) if (c.mediaId) aggiungi(ig, c.mediaId);
    if (generali && entra(2)) await recenti(ig, "me/media?fields=id,timestamp&limit=3", "timestamp");
  }
  if (fb && generali && entra(2)) await recenti(fb, `${fb.mittente}/published_posts?fields=id,created_time&limit=3`, "created_time");

  const elenco = [...posti.keys()].sort();
  if (!elenco.length) return esito;
  const inizio = Math.floor(now / FINESTRA_ROTAZIONE) % elenco.length;
  const scelti = Array.from({ length: Math.min(maxPost, elenco.length) }, (_, i) => posti.get(elenco[(inizio + i) % elenco.length])!);

  let nuovi = 0;
  for (const { canale, id: mediaId } of scelti) {
    if (!entra(1)) break;
    esito.chiamate++;
    const suFb = canale.piattaforma === "fb";
    const r = await graphGet(env, canale, suFb
      ? `${mediaId}/comments?fields=id,message,from,parent,created_time&limit=50`
      : `${mediaId}/comments?fields=id,text,from,username,parent_id,timestamp&limit=50`);
    if (!r.ok) {
      console.error("risponditore_recupero", mediaId, r.codice);
      continue;
    }
    for (const c of r.dati?.data ?? []) {
      if (nuovi >= NUOVI_PER_GIRO || !entra(CHIAMATE_PER_NUOVO)) break;
      const t = ora(suFb ? c?.created_time : c?.timestamp);
      // Meta vieta il messaggio privato dopo 7 giorni: inutile provarci.
      if (!c?.id || (t !== null && now - t > SETTE_GIORNI)) continue;
      const gia = await env.DB.prepare("SELECT 1 FROM risp_eventi WHERE commento_id = ?").bind(String(c.id)).first();
      if (gia) continue;
      const commento: Commento = suFb
        ? { id: String(c.id), testo: c.message ?? "", autoreId: c.from?.id ?? null, autoreNome: c.from?.name ?? null, mediaId, parentId: c.parent?.id ?? null, piattaforma: "fb" }
        : { id: String(c.id), testo: c.text ?? "", autoreId: c.from?.id ?? null, autoreNome: c.from?.username ?? c.username ?? null, mediaId, parentId: c.parent_id ?? null };
      try {
        const stato = await trattaCommento(env, commento, now);
        // Risposte, commenti dell'account e senza autore vengono scartati senza lavoro: non contano.
        if (stato !== "ignorato" || (await env.DB.prepare("SELECT 1 FROM risp_eventi WHERE commento_id = ?").bind(String(c.id)).first())) {
          nuovi++;
          esito.trovati++;
          esito.chiamate += CHIAMATE_PER_NUOVO;
        }
      } catch (err) {
        console.error("risponditore_recupero", mediaId, err instanceof Error ? err.message : "errore");
      }
    }
  }
  return esito;
}
