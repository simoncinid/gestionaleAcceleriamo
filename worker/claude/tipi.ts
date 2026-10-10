// Qui si importano i moduli che registrano i tipi di lavoro di Claude (registraTipo): classificazione e scheda
// (Task 7), coach (Task 8), commento del lunedì (Task 11). Il giro importa questo file, così i tipi esistono
// prima che la coda giri. Contratto di ogni gestore: al massimo 7 query D1 e 3 sottorichieste per lavoro
// (vedi il lavoro "claude" in worker/cron.ts).
export {};
