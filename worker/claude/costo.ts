import type { Impostazioni } from "../impostazioni/default";

export type ImpClaude = Impostazioni["claude"];
export type Prezzo = ImpClaude["prezzi"][string];
export type Uso = { ingresso: number; uscita: number; cacheLettura: number; cacheScrittura: number; ricerche: number };
export type Stima = { modello: string; ingresso: number; maxTokens: number; ricerche: number };

export const usoVuoto = (): Uso => ({ ingresso: 0, uscita: 0, cacheLettura: 0, cacheScrittura: 0, ricerche: 0 });
export const microsDaCents = (c: number) => c * 10_000; // 1 centesimo = 10.000 micro-dollari, dollari contati come euro
export const centsDaMicros = (m: number) => Math.ceil(m / 10_000);

// Prezzo per prefisso più lungo: "claude-haiku-4-5-20251001" usa "claude-haiku-4-5", "claude-sonnet-5-5" non usa
// "claude-sonnet-5". Un modello che non conosciamo costa come il più caro (il tetto non si sfora per un nome nuovo).
export function prezzoDi(imp: ImpClaude, modello: string): Prezzo {
  const chiave = Object.keys(imp.prezzi).filter((k) => modello.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (chiave) return imp.prezzi[chiave];
  const tutti = Object.values(imp.prezzi);
  if (!tutti.length) return { ingresso: 10, uscita: 50, cacheLettura: 1, cacheScrittura: 12.5 }; // listino vuoto: prudenza
  return tutti.reduce((a, b) => ({
    ingresso: Math.max(a.ingresso, b.ingresso),
    uscita: Math.max(a.uscita, b.uscita),
    cacheLettura: Math.max(a.cacheLettura, b.cacheLettura),
    cacheScrittura: Math.max(a.cacheScrittura, b.cacheScrittura),
  }));
}

// Prezzi in dollari per milione di token = micro-dollari per token.
export function costoMicros(u: Uso, modello: string, imp: ImpClaude): number {
  const p = prezzoDi(imp, modello);
  return Math.ceil(u.ingresso * p.ingresso + u.uscita * p.uscita + u.cacheLettura * p.cacheLettura + u.cacheScrittura * p.cacheScrittura + u.ricerche * imp.ricercaMicros);
}

// Il caso peggiore: tutto il max_tokens in uscita e tutte le ricerche usate.
export function costoMassimoMicros(s: Stima, imp: ImpClaude): number {
  return costoMicros({ ingresso: s.ingresso, uscita: s.maxTokens, cacheLettura: 0, cacheScrittura: 0, ricerche: s.ricerche }, s.modello, imp);
}

// Ogni ricerca web porta in ingresso le pagine trovate: si stimano 30.000 token per ricerca, più il prompt.
export const INGRESSO_PER_RICERCA = 30_000;
