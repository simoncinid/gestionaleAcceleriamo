import type { Env } from "../env";
import { getDb } from "../db/client";
import { avvisa } from "../avvisi/service";
import { metaFetch } from "../meta/fetcher";
import { leggiToken, salvaToken } from "./token";

const GIORNO = 86_400_000;
const PREAVVISO = 7 * GIORNO;

const TITOLO = "Risponditore: accesso a Instagram da rinnovare";

// Un solo avviso per scadenza: la chiave contiene scadeIl, quindi giri e giorni dopo non ne creano altri.
async function avvisoDaRinnovare(env: Env, scadeIl: number, now: number, causa: string | null): Promise<void> {
  const giorni = Math.max(0, Math.floor((scadeIl - now) / GIORNO));
  await avvisa(getDb(env.DB), {
    evento: "risponditore_errore",
    entityId: `token-${scadeIl}`,
    titolo: TITOLO,
    testo: `${causa ? `Il rinnovo automatico non è riuscito (${causa}). ` : ""}L'accesso scade tra ${giorni} giorni: ricollega l'account Instagram.`,
    href: "/automazioni/risponditore",
  }, now);
}

// Preavviso: mancano meno di 7 giorni alla scadenza (rinnovo fallito o mai tentato). Gira dal lavoro del risponditore.
export async function controllaScadenzaToken(env: Env, now: number): Promise<void> {
  const riga = await env.DB.prepare(`SELECT scade_il FROM ig_account WHERE id = 'principale'`).first<{ scade_il: number }>();
  if (riga && riga.scade_il - now < PREAVVISO) await avvisoDaRinnovare(env, riga.scade_il, now, null);
}

// Rinnova il token Instagram (dura 60 giorni). Salta se è stato salvato meno di 24 ore fa (Meta rifiuta il rinnovo).
// Se non riesce: scrive ultimoErrore e crea l'avviso (lo stesso del preavviso, stessa chiave). Il token non finisce
// mai nei log né nei messaggi di errore.
export async function rinnovaToken(env: Env, now: number): Promise<void> {
  const account = await leggiToken(env);
  if (!account) return;
  const r = await env.DB.prepare(`SELECT rinnovato_il FROM ig_account WHERE id = 'principale'`).first<{ rinnovato_il: number }>();
  if (r && now - r.rinnovato_il < GIORNO) return;
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
  await avvisoDaRinnovare(env, account.scadeIl, now, errore);
}
