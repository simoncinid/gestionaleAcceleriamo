// Registro dei lavori di Claude: importato dal giro (worker/cron.ts) e da worker/app.ts, così i tipi esistono
// prima che la coda giri. Il coach (Task 8) e il commento del lunedì (Task 11) si aggiungono qui.
// Contratto di ogni gestore: al massimo 7 query D1 e 3 sottorichieste per lavoro (vedi il lavoro "claude" in
// worker/cron.ts), contando insieme esegui e alErrore. Se dopo una chiamata riuscita il gestore scarta il risultato
// (validazione, salvataggio), lancia ErroreClaude con r.uso e r.modello, così la coda registra il costo vero;
// un errore qualsiasi viene contato al costo massimo stimato.
import { registraTipo } from "./coda";
import { TIPO_CLASSIFICAZIONE } from "./classificazione";
import { TIPO_SCHEDA } from "./scheda";

registraTipo("classificazione", TIPO_CLASSIFICAZIONE);
registraTipo("scheda", TIPO_SCHEDA);
