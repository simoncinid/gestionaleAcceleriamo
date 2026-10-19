import type { Env } from "../env";
import { getDb } from "../db/client";
import { avvisa } from "../avvisi/service";
import { metaFetch } from "../meta/fetcher";
import { leggiToken, salvaToken } from "./token";

const GIORNO = 86_400_000;
const PREAVVISO = 7 * GIORNO;

// Rinnova il token Instagram (dura 60 giorni). Se non riesce: scrive ultimoErrore e crea un solo avviso per scadenza
// (la chiave dell'avviso contiene scadeIl, quindi i giri dei giorni dopo non ne creano altri). Lo stesso avviso nasce
// se mancano meno di 7 giorni alla scadenza. Il token non finisce mai nei log né nei messaggi di errore.
export async function rinnovaToken(env: Env, now: number): Promise<void> {
  const account = await leggiToken(env);
  if (!account) return;
  let errore: string | null = null;
  try {
    const res = await metaFetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(account.token)}`, { method: "GET" });
    const dati: any = await res.json().catch(() => null);
    if (res.ok && dati?.access_token && Number(dati.expires_in) > 0) {
      await salvaToken(env, { ...account, token: String(dati.access_token), scadeIl: now + Number(dati.expires_in) * 1000 }, now);
      return;
    }
    errore = String(dati?.error?.message ?? `Errore ${res.status}`).slice(0, 200);
  } catch {
    errore = "Instagram non risponde";
  }
  await env.DB.prepare(`UPDATE ig_account SET ultimo_errore = ? WHERE id = 'principale'`).bind(errore).run();
  const giorni = Math.max(0, Math.floor((account.scadeIl - now) / GIORNO));
  await avvisa(getDb(env.DB), {
    evento: "risponditore_errore",
    entityId: `token-${account.scadeIl}`,
    titolo: "Risponditore: accesso a Instagram da rinnovare",
    testo: `Il rinnovo automatico non è riuscito (${errore}). L'accesso scade tra ${giorni} giorni: ricollega l'account Instagram.`,
    href: "/automazioni/risponditore",
  }, now);
}
