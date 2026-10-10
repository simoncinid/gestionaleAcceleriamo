import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../env";
import { usoVuoto, type Uso } from "./costo";
import { claudeFetch } from "./fetcher";

// Pagina "Limits" di Cloudflare Workers (letta il 10/10/2026): un Cron Trigger dura al massimo 15 minuti di orologio,
// sia sul piano gratuito sia su quello a pagamento (il tetto di 10 ms riguarda la CPU, l'attesa della rete non conta).
// Il giro fa fino a 3 lavori Claude in fila: 3 x 4 minuti = 12 minuti, dentro i 15 con margine per il resto del giro.
// La scadenza è una sola per tutta la chiamata, continuazioni comprese: oltre si interrompe e conta il costo massimo.
export const DURATA_MAX_MS = 240_000;
const FALLBACK_SONNET = true; // beta solo sulla Claude API: se un giorno dà 400, si mette a false
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const MAX_CONTINUAZIONI = 2;

export type RichiestaClaude = { modello: string; sistema: string; testo: string; maxTokens: number; schema?: Record<string, unknown>; ricerche?: number; durataMaxMs?: number };
export type Fonte = { url: string; titolo: string };
export type RispostaClaude = { testo: string; json: unknown; uso: Uso; modello: string; fonti: Fonte[] };

export class ErroreClaude extends Error {
  uso: Uso;
  modello: string;
  ritentabile: boolean;
  interrotta: boolean;
  constructor(messaggio: string, uso: Uso, modello: string, ritentabile: boolean, interrotta = false) {
    super(messaggio);
    this.uso = uso;
    this.modello = modello;
    this.ritentabile = ritentabile;
    this.interrotta = interrotta;
  }
}

function somma(u: Uso, x: Anthropic.Usage) {
  u.ingresso += x.input_tokens ?? 0;
  u.uscita += x.output_tokens ?? 0;
  u.cacheLettura += x.cache_read_input_tokens ?? 0;
  u.cacheScrittura += x.cache_creation_input_tokens ?? 0;
  u.ricerche += x.server_tool_use?.web_search_requests ?? 0;
}

// Una chiamata alla Messages API. Niente tentativi qui: li fa la coda al giro dopo. Il modello registrato è quello
// che ha risposto davvero (response.model), così il costo segue un eventuale fallback del server.
export async function chiamaClaude(env: Env, r: RichiestaClaude): Promise<RispostaClaude> {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY!,
    fetch: ((url: RequestInfo | URL, init?: RequestInit) => claudeFetch(String(url), init)) as typeof fetch,
    maxRetries: 0,
  });
  const scadenza = Date.now() + (r.durataMaxMs ?? DURATA_MAX_MS);
  const fallback = FALLBACK_SONNET && r.modello.startsWith("claude-sonnet-5-5");
  const uso = usoVuoto();
  let modello = r.modello;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: r.testo }];
  for (let i = 0; i <= MAX_CONTINUAZIONI; i++) {
    const resta = scadenza - Date.now();
    if (resta <= 0) throw new ErroreClaude("Chiamata interrotta", uso, modello, true, true);
    // Il pensiero resta quello predefinito del modello: su Sonnet 5.5 "disabled" dà 400.
    const params = {
      model: r.modello,
      max_tokens: r.maxTokens,
      system: r.sistema,
      messages,
      ...(r.ricerche ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: r.ricerche }] } : {}),
      ...(r.schema ? { output_config: { format: { type: "json_schema", schema: r.schema } } } : {}),
      ...(fallback ? { fallbacks: "default" } : {}),
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    let res: Anthropic.Message;
    try {
      res = await client.messages.create(params, { timeout: resta, ...(fallback ? { headers: { "anthropic-beta": BETA_FALLBACK } } : {}) });
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status) {
        const ritentabile = e.status === 429 || e.status === 529 || e.status >= 500;
        throw new ErroreClaude(`Claude ha risposto ${e.status}`, uso, modello, ritentabile);
      }
      // Tempo scaduto o rete caduta: non sappiamo quanto è costato, la coda conta il massimo.
      throw new ErroreClaude("Chiamata interrotta", uso, modello, true, true);
    }
    somma(uso, res.usage);
    modello = res.model;
    if (res.stop_reason === "pause_turn") {
      // La ricerca web si è fermata a metà: si rimanda il turno dell'assistente così com'è e il server riprende.
      messages.push({ role: "assistant", content: res.content as unknown as Anthropic.ContentBlockParam[] });
      continue;
    }
    if (res.stop_reason === "refusal") throw new ErroreClaude("Claude ha rifiutato la richiesta", uso, modello, false);
    if (res.stop_reason === "max_tokens") throw new ErroreClaude("Risposta troncata", uso, modello, false);
    const testi = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const testo = testi.map((b) => b.text).join("");
    const fonti = new Map<string, Fonte>();
    for (const b of testi) {
      for (const c of b.citations ?? []) {
        if ("url" in c && c.url) fonti.set(c.url, { url: c.url, titolo: ("title" in c && c.title) || c.url });
      }
    }
    let json: unknown = null;
    if (r.schema) {
      try {
        json = JSON.parse(testo);
      } catch {
        throw new ErroreClaude("Risposta non leggibile", uso, modello, false);
      }
    }
    return { testo, json, uso, modello, fonti: [...fonti.values()] };
  }
  throw new ErroreClaude("Ricerca troppo lunga", uso, modello, false);
}
