import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { trattaCommento } from "./commenti";
import { igGet } from "./graph";
import { leggiToken } from "./token";

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
export async function recuperaCommenti(env: Env, now: number, maxPost: number, budget = maxPost * 2): Promise<{ trovati: number; chiamate: number }> {
  const esito = { trovati: 0, chiamate: 0 };
  if (maxPost <= 0 || budget < 2) return esito;
  const entra = (n: number) => esito.chiamate + n <= budget;
  const account = await leggiToken(env);
  if (!account) return esito;
  const campagne = await drizzle(env.DB).select().from(rispCampagne).where(eq(rispCampagne.attiva, true)).all();
  if (!campagne.length) return esito;

  const posti = new Set<string>(campagne.flatMap((c) => (c.mediaId ? [c.mediaId] : [])));
  if (campagne.some((c) => !c.mediaId) && entra(2)) {
    esito.chiamate++;
    const r = await igGet(env, account.token, "me/media?fields=id,timestamp&limit=3");
    if (r.ok) {
      for (const m of r.dati?.data ?? []) {
        const t = ora(m?.timestamp);
        if (m?.id && t !== null && now - t <= SETTE_GIORNI) posti.add(String(m.id));
      }
    }
  }
  const elenco = [...posti].sort();
  if (!elenco.length) return esito;
  const inizio = Math.floor(now / FINESTRA_ROTAZIONE) % elenco.length;
  const scelti = Array.from({ length: Math.min(maxPost, elenco.length) }, (_, i) => elenco[(inizio + i) % elenco.length]);

  let nuovi = 0;
  for (const mediaId of scelti) {
    if (!entra(1)) break;
    esito.chiamate++;
    const r = await igGet(env, account.token, `${mediaId}/comments?fields=id,text,from,username,parent_id,timestamp&limit=50`);
    if (!r.ok) {
      console.error("risponditore_recupero", mediaId, r.codice);
      continue;
    }
    for (const c of r.dati?.data ?? []) {
      if (nuovi >= NUOVI_PER_GIRO || !entra(CHIAMATE_PER_NUOVO)) break;
      const t = ora(c?.timestamp);
      // Meta vieta il messaggio privato dopo 7 giorni: inutile provarci.
      if (!c?.id || (t !== null && now - t > SETTE_GIORNI)) continue;
      const gia = await env.DB.prepare("SELECT 1 FROM risp_eventi WHERE commento_id = ?").bind(String(c.id)).first();
      if (gia) continue;
      try {
        const stato = await trattaCommento(env, {
          id: String(c.id),
          testo: c.text ?? "",
          autoreId: c.from?.id ?? null,
          autoreNome: c.from?.username ?? c.username ?? null,
          mediaId,
          parentId: c.parent_id ?? null,
        }, now);
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
