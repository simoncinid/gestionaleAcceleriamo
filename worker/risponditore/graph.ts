import { metaFetch } from "../meta/fetcher";
import type { Env } from "../env";
import type { RispEvento } from "../db/schema";
import { leggiToken } from "./token";

export type EsitoGraph = { ok: true; dati: any } | { ok: false; codice: number | null; messaggio: string };
export type Piattaforma = RispEvento["piattaforma"];

// Il canale di una piattaforma: token, id dell'account (per non rispondere a sé stessi) e mittente dei messaggi.
// Instagram usa il token salvato in D1 e "me"; Facebook il token di Pagina e l'id della Pagina.
export type Canale = { piattaforma: Piattaforma; token: string; proprioId: string; mittente: string };

export async function leggiCanale(env: Env, piattaforma: Piattaforma): Promise<Canale | null> {
  if (piattaforma === "fb") {
    if (!env.META_PAGE_TOKEN || !env.META_PAGE_ID) return null;
    return { piattaforma, token: env.META_PAGE_TOKEN, proprioId: env.META_PAGE_ID, mittente: env.META_PAGE_ID };
  }
  const account = await leggiToken(env);
  return account ? { piattaforma, token: account.token, proprioId: account.igUserId, mittente: "me" } : null;
}

function indirizzo(env: Env, percorso: string, piattaforma: Piattaforma): string {
  const pulito = percorso.replace(/^\/+/, "");
  if (piattaforma === "fb") return `https://graph.facebook.com/${env.META_GRAPH_VERSION || "v23.0"}/${pulito}`;
  return `https://graph.instagram.com/${env.IG_GRAPH_VERSION || "v25.0"}/${pulito}`;
}

async function chiama(env: Env, token: string, percorso: string, init: RequestInit, piattaforma: Piattaforma = "ig"): Promise<EsitoGraph> {
  try {
    const res = await metaFetch(indirizzo(env, percorso, piattaforma), {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
    });
    const dati: any = await res.json().catch(() => null);
    if (res.ok && !dati?.error) return { ok: true, dati };
    return { ok: false, codice: dati?.error?.code ?? res.status ?? null, messaggio: String(dati?.error?.message ?? `Errore ${res.status}`) };
  } catch (err) {
    return { ok: false, codice: null, messaggio: err instanceof Error ? err.message : "Errore di rete" };
  }
}

export const igPost = (env: Env, token: string, percorso: string, corpo: unknown) =>
  chiama(env, token, percorso, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

export const igGet = (env: Env, token: string, percorso: string) => chiama(env, token, percorso, { method: "GET" });

// Le stesse chiamate sul canale giusto (Instagram o Pagina Facebook).
export const graphPost = (env: Env, canale: Canale, percorso: string, corpo: unknown) =>
  chiama(env, canale.token, percorso, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }, canale.piattaforma);

export const graphGet = (env: Env, canale: Canale, percorso: string) => chiama(env, canale.token, percorso, { method: "GET" }, canale.piattaforma);
