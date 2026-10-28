import type { StatoScadenza } from "../../types";
import { giorniDaOggi } from "./tabellaLead";

// Colori di stato del contratto blocco 1, sezione 6. Un posto solo: tabella, Oggi e menu li leggono da qui.
// La passata UI (modifica 23) può spostarli nei token di styles.css senza cambiare chi li usa.

// I colori delle fasi stanno in EtichettaFase.tsx (blocco 1 bis), presi dal tono della tabella stages.

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
