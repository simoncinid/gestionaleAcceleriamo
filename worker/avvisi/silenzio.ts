import type { EventoAvviso } from "../db/schema";
import { partiRoma } from "../lib/roma";

export type Silenzio = { attive: boolean; da: string; a: string };
const minuti = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Un JSON rovinato nel profilo non deve fermare la consegna: vale come "niente impostato".
function leggi<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Ore di silenzio sul fuso di Roma; "22:00 → 07:30" attraversa la mezzanotte.
export function inSilenzio(json: string | null, now: number): boolean {
  const s = leggi<Silenzio>(json);
  if (!s?.attive || typeof s.da !== "string" || typeof s.a !== "string") return false;
  const p = partiRoma(now);
  const ora = p.ore * 60 + p.minuti;
  const da = minuti(s.da);
  const a = minuti(s.a);
  if (Number.isNaN(da) || Number.isNaN(a)) return false;
  return da <= a ? ora >= da && ora < a : ora >= da || ora < a;
}

// Avvisi per evento (spec 11.4): spento = niente push e niente Telegram, l'avviso in app resta.
export function canaleAcceso(prefsJson: string | null, evento: EventoAvviso): boolean {
  const prefs = leggi<Record<string, boolean>>(prefsJson);
  return prefs?.[evento] !== false;
}
