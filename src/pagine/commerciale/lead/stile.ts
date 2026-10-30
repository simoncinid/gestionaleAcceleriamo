import type { StatoScadenza } from "../../../types";

// Valori della sezione 6 del contratto di design (blocco 1) per la scheda del lead e le pagine collegate.
// Stanno qui finché la passata UI (modifica 23) non li porta nei token di src/styles.css: allora si sostituiscono.

// Contenitore bianco con bordo e raggio 10, spazio interno 20, 12 tra le righe. Mai uno dentro l'altro.
export const SEZIONE = "flex min-w-0 flex-col gap-3 rounded-[10px] border border-sabbia bg-white p-5";
// Titolo di sezione: livello "sezione" della scala (Degular 20/24), col segno arancione sopra (giro 3).
export const TITOLO_SEZIONE = "segno font-display text-sezione text-ink";
// Dati secondari: livello "nota" (13/18, grigio).
export const SECONDARIO = "text-nota text-grigio tabular-nums";
// Righe di elenco dentro una sezione: separatori, mai riquadri.
export const ELENCO = "flex flex-col divide-y divide-[#E5DED4]";
// Link a testo (azioni terziarie): bersaglio da 44 px.
export const LINK = "inline-flex min-h-11 items-center text-left font-semibold text-ink underline decoration-[#CFC6B9] underline-offset-4 hover:decoration-ink";

// Colori di stato, un significato ciascuno. Il testo "oggi" usa l'arancione scuro del brand: #EC5E2D su bianco
// fa 3,2:1 e non regge il testo piccolo; il pallino resta #EC5E2D.
export const ROSSO = "#B42318";
export const ARANCIONE = "#EC5E2D";
export const ARANCIONE_TESTO = "#B8431C";
export const GRIGIO = "#6B645C";
export const VERDE = "#1F7A4D";
export const BLU = "#2E5AAC";
export const OCRA = "#B7791F";

export const COLORE_STATO: Record<StatoScadenza, string> = { scaduto: ROSSO, oggi: ARANCIONE_TESTO, futuro: GRIGIO };

// I colori delle fasi stanno in coloriLead.ts e li usa EtichettaFase.tsx: un aspetto solo in tutto il gestionale.
