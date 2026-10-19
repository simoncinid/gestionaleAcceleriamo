import { metaFetch } from "../meta/fetcher";
import type { Env } from "../env";

export type EsitoGraph = { ok: true; dati: any } | { ok: false; codice: number | null; messaggio: string };

function indirizzo(env: Env, percorso: string): string {
  const versione = env.IG_GRAPH_VERSION || "v25.0";
  return `https://graph.instagram.com/${versione}/${percorso.replace(/^\/+/, "")}`;
}

async function chiama(env: Env, token: string, percorso: string, init: RequestInit): Promise<EsitoGraph> {
  try {
    const res = await metaFetch(indirizzo(env, percorso), {
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
