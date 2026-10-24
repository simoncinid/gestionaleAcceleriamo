import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";
import { rispCampagne } from "../db/schema";
import { inviaPrivato } from "./commenti";
import { MOTIVI_NON_RITENTABILI, motivoErrore, registraFallimento, TENTATIVI_MAX } from "./errori";
import { scegliCampagna } from "./parola";
import { recuperaCommenti } from "./recupero";
import { leggiCanale, type Canale, type Piattaforma } from "./graph";

const ATTESA = 10 * 60_000;

type Riga = { commento_id: string; media_id: string; autore_id: string; testo: string; campagna_id: string | null; stato: string; piattaforma: Piattaforma };

// Rifà solo il passo 6 (il messaggio privato) per gli eventi in errore ritentabile, con meno di 3 tentativi e fermi da
// più di 10 minuti, e per quelli rimasti in_corso oltre i 10 minuti (un tentativo interrotto: conta come tentativo).
// Poi, se resta budget (limite meno i ritentativi), il recupero dei commenti persi: sottorichieste conta le chiamate
// fatte davvero (ritentativi più recupero), che il cron restituisce al giro.
export async function giroRisponditore(env: Env, now: number, limite: number): Promise<{ ritentati: number; sottorichieste: number }> {
  if (limite <= 0) return { ritentati: 0, sottorichieste: 0 };
  // Si ritenta solo sui canali collegati: gli eventi di un canale spento restano fermi.
  const canali: Partial<Record<Piattaforma, Canale>> = {};
  for (const p of ["ig", "fb"] as const) {
    const canale = await leggiCanale(env, p);
    if (canale) canali[p] = canale;
  }
  if (!canali.ig && !canali.fb) return { ritentati: 0, sottorichieste: 0 };
  const ritentati = await ritenta(env, now, limite, canali);
  // Il cron riserva sottoPerUnita (2) a unità; i ritentativi ne usano una ciascuno, il resto è del recupero.
  const budget = limite * 2 - ritentati;
  let recupero = 0;
  if (budget >= 2) {
    try {
      recupero = (await recuperaCommenti(env, now, budget, budget)).chiamate;
    } catch (err) {
      console.error("risponditore_recupero", err instanceof Error ? err.message : "errore");
    }
  }
  return { ritentati, sottorichieste: ritentati + recupero };
}

async function ritenta(env: Env, now: number, limite: number, canali: Partial<Record<Piattaforma, Canale>>): Promise<number> {
  const soglia = now - ATTESA;
  const nonRitentabili = MOTIVI_NON_RITENTABILI.map(() => "?").join(",");
  const piattaforme = Object.keys(canali);
  const { results } = await env.DB.prepare(
    `SELECT commento_id, media_id, autore_id, testo, campagna_id, stato, piattaforma FROM risp_eventi
     WHERE tentativi < ? AND aggiornato_il < ? AND piattaforma IN (${piattaforme.map(() => "?").join(",")})
       AND (stato = 'in_corso' OR (stato = 'errore' AND COALESCE(motivo, '') NOT IN (${nonRitentabili})))
     ORDER BY aggiornato_il LIMIT ?`,
  )
    .bind(TENTATIVI_MAX, soglia, ...piattaforme, ...MOTIVI_NON_RITENTABILI, limite)
    .all<Riga>();
  if (!results.length) return 0;

  const campagne = await drizzle(env.DB).select().from(rispCampagne).all();
  let ritentati = 0;
  for (const r of results) {
    const campagna = (r.campagna_id ? campagne.find((c) => c.id === r.campagna_id) : null) ?? scegliCampagna(campagne, r.media_id, r.testo);
    if (!campagna) {
      await env.DB.prepare(`UPDATE risp_eventi SET stato = 'ignorato', motivo = 'nessuna parola chiave', aggiornato_il = ? WHERE commento_id = ?`).bind(now, r.commento_id).run();
      continue;
    }
    // Stessa persona, campagna e post già serviti da un altro commento: niente secondo messaggio privato.
    const gia = await env.DB.prepare(
      `SELECT 1 FROM risp_eventi WHERE campagna_id = ? AND autore_id = ? AND media_id = ? AND stato IN ('inviato','link_inviato') AND commento_id != ? LIMIT 1`,
    )
      .bind(campagna.id, r.autore_id, r.media_id, r.commento_id)
      .first();
    if (gia) {
      await env.DB.prepare(`UPDATE risp_eventi SET stato = 'ignorato', campagna_id = ?, motivo = 'già risposto a questa persona', aggiornato_il = ? WHERE commento_id = ?`).bind(campagna.id, now, r.commento_id).run();
      continue;
    }
    // Il tentativo interrotto di un in_corso conta come tentativo (senza avviso: se questo riesce non c'è nulla da dire).
    if (r.stato === "in_corso") {
      await env.DB.prepare(`UPDATE risp_eventi SET tentativi = tentativi + 1, campagna_id = ?, aggiornato_il = ? WHERE commento_id = ?`).bind(campagna.id, now, r.commento_id).run();
    }
    ritentati++;
    const canale = canali[r.piattaforma]!;
    try {
      const priv = await inviaPrivato(env, canale, campagna, r.commento_id);
      if (priv.ok) {
        await env.DB.prepare(`UPDATE risp_eventi SET stato = 'inviato', aggiornato_il = ? WHERE commento_id = ?`).bind(now, r.commento_id).run();
      } else {
        await registraFallimento(env, r.commento_id, motivoErrore(priv.codice, priv.messaggio, r.piattaforma).motivo, now, { campagnaId: campagna.id });
      }
    } catch (err) {
      await registraFallimento(env, r.commento_id, (err instanceof Error ? err.message : String(err)).slice(0, 200), now, { campagnaId: campagna.id });
    }
  }
  return ritentati;
}
