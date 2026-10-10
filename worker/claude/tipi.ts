// Registro dei lavori di Claude: importato dal giro (worker/cron.ts) e da worker/app.ts, così i tipi esistono
// prima che la coda giri.
// Contratto di ogni gestore: al massimo 7 query D1 e 3 sottorichieste per lavoro (vedi il lavoro "claude" in
// worker/cron.ts). alErrore è compreso nel 7: le query di esegui più quelle di alErrore (che gira solo dopo un
// errore definitivo) stanno insieme sotto 7. Oggi: scheda 5 più 1, coach 5 più 1, classificazione 4 più 0,
// commento 2 più 0. Se dopo una chiamata riuscita il gestore scarta il risultato
// (validazione, salvataggio), lancia ErroreClaude con r.uso e r.modello, così la coda registra il costo vero;
// un errore qualsiasi viene contato al costo massimo stimato.
import { registraTipo } from "./coda";
import { TIPO_CLASSIFICAZIONE } from "./classificazione";
import { TIPO_COACH } from "./coach";
import { TIPO_COMMENTO } from "./commento";
import { TIPO_SCHEDA } from "./scheda";

registraTipo("classificazione", TIPO_CLASSIFICAZIONE);
registraTipo("scheda", TIPO_SCHEDA);
registraTipo("coach", TIPO_COACH);
registraTipo("commento", TIPO_COMMENTO);
