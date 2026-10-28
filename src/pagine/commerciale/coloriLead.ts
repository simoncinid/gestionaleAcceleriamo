import type { StatoScadenza } from "../../types";
import { giorniDaOggi } from "./tabellaLead";

// Colori di stato del contratto blocco 1, sezione 6. Un posto solo: tabella, Oggi e menu li leggono da qui.
// La passata UI (modifica 23) può spostarli nei token di styles.css senza cambiare chi li usa.

// Colori delle fasi (blocco 1 bis, seconda passata): uno per fase, scelto dall'id della fase (stabile anche se in
// Impostazioni > Fasi si cambia il nome). Il campo tone della tabella stages non si usa più per il colore.
// Sfondo: il colore pieno al 18% su bianco, in tinta solida (sulla riga a zebra non cambia). Bordo: il colore pieno.
// Testo: il colore pieno scurito quanto basta per stare sopra 4,5:1 sul suo sfondo (dal 20% al 38%: il giallo
// scurito del solo 20% faceva 3:1). Contrasti misurati nella prova tests/b1bis-etichetta-fase.test.tsx.
export type ColoreFase = { pieno: string; sfondo: string; testo: string };
const COLORI_FASE: Record<string, ColoreFase> = {
  "da-chiamare-prima-volta": { pieno: "#EC5E2D", sfondo: "#FCE2D9", testo: "#AC4521" }, // 10 arancione brand, 4,7:1
  "da-richiamare": { pieno: "#D9A300", sfondo: "#F8EED1", testo: "#876500" }, // 20 giallo, 4,7:1
  "appuntamento-confermato": { pieno: "#1E9AD6", sfondo: "#D7EDF8", testo: "#156D98" }, // 30 azzurro, 4,7:1
  "in-attesa-preventivo": { pieno: "#8AA31C", sfondo: "#EAEED6", testo: "#5F7013" }, // 35 oliva, 4,6:1
  "presentazione-confermata": { pieno: "#3357D9", sfondo: "#DAE1F8", testo: "#2946AE" }, // 40 blu, 6,2:1
  "analisi-fissata": { pieno: "#0E9F8A", sfondo: "#D4EEEA", testo: "#0A7465" }, // 45 verde acqua, 4,6:1
  "in-attesa-progetto": { pieno: "#C446B6", sfondo: "#F4DEF2", testo: "#9D3892" }, // 50 magenta, 4,9:1
  "progetto-fissato": { pieno: "#7A4FE0", sfondo: "#E7DFF9", testo: "#623FB3" }, // 55 viola, 5,7:1
  "in-attesa-decisione": { pieno: "#E04E6B", sfondo: "#F9DFE4", testo: "#AF3D53" }, // 60 corallo, 4,6:1
  chiuso: { pieno: "#16A34A", sfondo: "#D5EEDE", testo: "#107736" }, // 70 verde, 4,6:1
  "non-chiuso": { pieno: "#6B7280", sfondo: "#E4E6E8", testo: "#565B66" }, // 80 grigio, 5,4:1
  fake: { pieno: "#9A8C7A", sfondo: "#EDEAE7", testo: "#706659" }, // 90 grigio caldo, 4,7:1
};
// Fase che non si riconosce (dati vecchi): grigio.
export const coloreFase = (id: string | null | undefined): ColoreFase => COLORI_FASE[id ?? ""] ?? COLORI_FASE["non-chiuso"];

// Testo della scadenza. Rosso solo oltre un giorno di ritardo; "oggi" in arancione scuro (#B8431C, il token
// accento-testo): l'arancione del brand su bianco fa 3:1 e non si legge a 14 px. La parola ("scaduta da", "oggi")
// distingue i due stati anche senza colore.
// Blocco 1 bis: anche "ieri 17:45" è rosso (è già passata), se si passano scadenza e ora.
export function classeScadenza(stato: StatoScadenza | null | undefined, scadenza?: number | null, ora?: number) {
  const ieriOPrima = scadenza != null && ora != null && giorniDaOggi(scadenza, ora) < 0;
  if (stato === "scaduto" || ieriOPrima) return "font-semibold text-[#B42318]";
  if (stato === "oggi") return "font-semibold text-accento-testo";
  return "text-grigio";
}
