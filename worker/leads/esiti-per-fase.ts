import { FASE } from "../processo/processo";
import type { Esito } from "../regole/motore";

// Esiti validi per fase (modifica 25): in 10 e 20 solo le telefonate, poi una riga per ogni passo del percorso.
// "Non interessato" e "Non profilato" valgono in tutte le fasi aperte; 70, 80, 90 nessuno. Copia unica: l'interfaccia la importa da qui.
const CHIUSURE: Esito[] = ["non_interessato", "fuori_target"];
const TELEFONATE: Esito[] = ["non_risponde", "occupato", "richiamare", "risposto", "conoscenza_fissata"];
const DOPO_CALL: Esito[] = ["richiamare", "non_risponde", "occupato"];
export const ESITI_PER_FASE: Record<string, Esito[]> = {
  [FASE.nuovo]: [...TELEFONATE, ...CHIUSURE],
  [FASE.richiamare]: [...TELEFONATE, ...CHIUSURE],
  [FASE.conoscenza]: ["conoscenza_fatta", "offerta_fissata", ...DOPO_CALL, ...CHIUSURE],
  [FASE.attesaOfferta]: ["offerta_pronta", "offerta_fissata", ...DOPO_CALL, "risposto", ...CHIUSURE],
  [FASE.offerta]: ["offerta_presentata", "analisi_fissata", ...DOPO_CALL, ...CHIUSURE],
  [FASE.analisi]: ["analisi_fatta", "progetto_fissato", ...DOPO_CALL, ...CHIUSURE],
  [FASE.attesaProgetto]: ["progetto_pronto", "progetto_fissato", ...DOPO_CALL, "risposto", ...CHIUSURE],
  [FASE.progetto]: ["progetto_presentato", ...DOPO_CALL, ...CHIUSURE],
  [FASE.decisione]: ["risposto", "richiamare", "non_risponde", "occupato", "progetto_fissato", ...CHIUSURE],
};
