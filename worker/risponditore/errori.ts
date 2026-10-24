import type { Env } from "../env";
import { getDb } from "../db/client";
import { avvisa } from "../avvisi/service";

export const MOTIVO_SCADUTO = "accesso a Instagram scaduto";
export const MOTIVO_FINESTRA = "finestra dei 7 giorni chiusa o messaggi non consentiti";
export const MOTIVO_NON_COLLEGATO = "Account Instagram non collegato";
export const MOTIVO_FB_SCADUTO = "accesso alla Pagina Facebook scaduto";
export const MOTIVO_FB_NON_COLLEGATO = "Pagina Facebook non collegata";
// Motivi fissi di un errore che riprovare non risolve: servono al giro per non riprendere questi eventi.
export const MOTIVI_NON_RITENTABILI = [MOTIVO_SCADUTO, MOTIVO_FINESTRA, MOTIVO_NON_COLLEGATO, MOTIVO_FB_SCADUTO, MOTIVO_FB_NON_COLLEGATO];

export const TENTATIVI_MAX = 3;

export function motivoErrore(codice: number | null, messaggio: string, piattaforma: "ig" | "fb" = "ig"): { motivo: string; ritentabile: boolean } {
  const fb = piattaforma === "fb";
  if (codice === 190) return { motivo: fb ? MOTIVO_FB_SCADUTO : MOTIVO_SCADUTO, ritentabile: false };
  if (codice === 4 || codice === 17 || codice === 32 || codice === 613) return { motivo: "troppe richieste, riprovo", ritentabile: true };
  if (codice === 10 || codice === 551 || codice === 2018278) return { motivo: MOTIVO_FINESTRA, ritentabile: false };
  if (codice === null) return { motivo: fb ? "Facebook non risponde, riprovo" : "Instagram non risponde, riprovo", ritentabile: true };
  return { motivo: messaggio, ritentabile: true };
}

// Segna un tentativo fallito del passo 6: errore, motivo, un tentativo in più. L'avviso in app nasce una volta sola,
// quando l'evento arriva a 3 tentativi o l'accesso è scaduto (la chiave dell'avviso è l'id del commento).
export async function registraFallimento(
  env: Env,
  commentoId: string,
  motivo: string,
  now: number,
  extra: { campagnaId?: string; rispostaPubblicaId?: string | null } = {},
): Promise<void> {
  const r = await env.DB.prepare(
    `UPDATE risp_eventi SET stato = 'errore', motivo = ?, campagna_id = COALESCE(?, campagna_id), risposta_pubblica_id = COALESCE(?, risposta_pubblica_id),
     tentativi = tentativi + 1, aggiornato_il = ? WHERE commento_id = ? RETURNING tentativi, autore_nome`,
  )
    .bind(motivo, extra.campagnaId ?? null, extra.rispostaPubblicaId ?? null, now, commentoId)
    .first<{ tentativi: number; autore_nome: string | null }>();
  if (!r || (r.tentativi < TENTATIVI_MAX && motivo !== MOTIVO_SCADUTO && motivo !== MOTIVO_FB_SCADUTO)) return;
  await avvisa(getDb(env.DB), {
    evento: "risponditore_errore",
    entityId: commentoId,
    titolo: "Risponditore: messaggio non partito",
    testo: `${r.autore_nome ? `Il messaggio per ${r.autore_nome}` : "Un messaggio"} non è partito: ${motivo}.`,
    href: "/automazioni/risponditore",
  }, now);
}
