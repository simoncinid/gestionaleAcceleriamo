import { FASE } from "../../../worker/processo/processo";
import type { StatoScadenza } from "../../types";
import { giorniDaOggi } from "./tabellaLead";

// Colori di stato e pallini di fase del contratto blocco 1, sezione 6. Un posto solo: tabella, Oggi e menu li leggono da qui.
// La passata UI (modifica 23) può spostarli nei token di styles.css senza cambiare chi li usa.

// Pallini: arancione = tocca a noi (10, 20, 35, 50), blu = c'è una data in calendario (30, 40, 45, 55),
// ocra = aspettiamo il cliente (60), verde = Cliente, grigio = 80 e 90.
const PALLINI: Record<string, string> = {
  [FASE.nuovo]: "bg-[#EC5E2D]",
  [FASE.richiamare]: "bg-[#EC5E2D]",
  [FASE.attesaOfferta]: "bg-[#EC5E2D]",
  [FASE.attesaProgetto]: "bg-[#EC5E2D]",
  [FASE.conoscenza]: "bg-[#2E5AAC]",
  [FASE.offerta]: "bg-[#2E5AAC]",
  [FASE.analisi]: "bg-[#2E5AAC]",
  [FASE.progetto]: "bg-[#2E5AAC]",
  [FASE.decisione]: "bg-[#B7791F]",
  [FASE.cliente]: "bg-[#1F7A4D]",
  [FASE.perso]: "bg-[#6B645C]",
  [FASE.nonProfilato]: "bg-[#6B645C]",
};
export const classePallino = (stageId: string) => PALLINI[stageId] ?? "bg-[#6B645C]";

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
