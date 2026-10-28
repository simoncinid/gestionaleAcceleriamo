import { FASI_CON_CALL as FASI_CALL_WORKER } from "../../../../worker/regole/fasi-call";
import { daRoma, partiRoma } from "../../../../worker/lib/roma";
import { dataTesto } from "../../../../worker/processo/processo";
import type { StatoScadenza } from "../../../types";

// Testi della riga "Da fare" (contratto blocco 1, sezione 3). Solo parole: azione, scadenza e stato arrivano da
// prossimaAzione sul server, qui non si ricalcola niente.

const GIORNO = 86_400_000;
const ore = (ms: number) => { const p = partiRoma(ms); return `${p.ore}:${String(p.minuti).padStart(2, "0")}`; };
const numeroGiorno = (ms: number) => { const p = partiRoma(ms); return Math.round(daRoma(p.anno, p.mese, p.giorno) / GIORNO); };

// "Mercoledì 28 ottobre, 19:26".
export const dataEOra = (ms: number) => { const t = `${dataTesto(ms)}, ${ore(ms)}`; return t[0].toUpperCase() + t.slice(1); };

// Distanza nel tempo col suo stato: rosso solo oltre un giorno, arancione oggi, grigio il futuro.
export function distanza(scadenza: number, stato: StatoScadenza, ora: number): string {
  if (stato === "scaduto") {
    const n = Math.max(1, numeroGiorno(ora) - numeroGiorno(scadenza));
    return `scaduta da ${n} ${n === 1 ? "giorno" : "giorni"}`;
  }
  if (scadenza < ora) {
    const minuti = Math.round((ora - scadenza) / 60_000);
    return minuti < 60 ? `da fare adesso (era alle ${ore(scadenza)})` : `da fare oggi (era alle ${ore(scadenza)})`;
  }
  const giorni = numeroGiorno(scadenza) - numeroGiorno(ora);
  if (giorni <= 0) return `oggi alle ${ore(scadenza)}`;
  if (giorni === 1) return `domani alle ${ore(scadenza)}`;
  return `fra ${giorni} giorni`;
}

// Fasi in cui la scadenza è l'ora di una call (30, 40, 45, 55: modifica 25).
export const FASI_CON_CALL = Object.keys(FASI_CALL_WORKER);
// Fasi in cui contano i tentativi di chiamata.
export const FASI_TENTATIVI = ["da-chiamare-prima-volta", "da-richiamare"];
