# Avanzamento 28/10/2026: blocco 0, preparazione

Piano: rapporto unico del 26/10 (wiki, `companies/acceleriamo/miglioramenti/2026-10-26-audit-gestionale/rapporto-unico.md`), blocco 0.
Chi: Silvio (sviluppatore). Ramo `acceleriamo-os`, commit locali, niente push.

## Fatto

1. `git pull diego acceleriamo-os`: già allineato, nessun commit nuovo di Diego dopo `ae836eb`.
2. Prova rossa sistemata (Riccardo M11), commit `3dbb2dd`.
   - `tests-nodo/risorse-dati-veri.test.ts` legge una copia delle 17 risorse con grafiche, in `tests-nodo/fixture/risorse-risponditore.json`.
   - Niente più salto quando manca il file: la prova gira su ogni computer.
   - Controllo contro il file vivo del wiki: `RISORSE_FILE=<file.json> npm run controlla:risorse`.
   - Provato che non è cieca: con un passo cambiato nella copia la prova fallisce (firma dei passi diversa).
   - Contro il wiki oggi fallisce, ed è giusto: il file è passato da 17 a 37 risorse, le 20 nuove non hanno grafiche nel gestionale.
3. `.gitignore` con `.env*` e `*.pem` (Riccardo B6), commit `2b92e2f`. Nessun file del genere era tracciato.
4. Esiti
   - `npm test`: 111 file, 1.209 prove passano; prove Node 1 su 1.
   - `npm run typecheck`: pulito.
   - `npm run build`: pulita, resta l'avviso noto sul pacchetto JavaScript sopra 500 kB.
   - Anteprima di Corrado (collaudatore) su 5210: mai toccata, risponde 200 (è il server di sviluppo, non legge `dist/`).

## Dipendenze (solo analisi, niente installato)

`npm audit`: 16 voci (2 critiche, 8 alte, 6 moderate). Online finiscono solo `drizzle-orm` e `zod`; il resto è solo per prove e pubblicazione.

| Pacchetto | Da, a | Gravità e dove | Cosa cambia | Rischio |
|---|---|---|---|---|
| `drizzle-orm` | 0.44.7, 0.45.4 | Alta, online (SQL injection sui nomi di colonna) | 0.45.x senza rotture dichiarate. Il codice non costruisce nomi di colonna da input (unico `sql.raw` su una costante dello schema). Va cambiato `package.json` (`^0.44` non arriva a 0.45). | Basso |
| `wrangler` + `@cloudflare/vite-plugin` | 4.149.0, 4.154.0; 1.63.1, 1.65.0 | Alta, solo pubblicazione (il buco è in `wrangler pages deploy`, che non usiamo) | Aggiornamenti minori; il plugin chiede wrangler 4.152 o più. | Basso |
| `vitest` + `@cloudflare/vitest-pool-workers` | 3.2.7, 4.1.12; 0.8.71, 0.23.0 | Critica, solo sul computer delle prove (tinypool, mocker) | Salto grosso: `vitest.config.ts` da riscrivere (`defineWorkersConfig` sostituito dal plugin `cloudflareTest()`), `singleWorker` tolto, database isolato per file (forse serve `--max-workers=1 --no-isolate`). `cloudflare:test` usato in 59 file: deprecato ma funziona. Vitest 5 non va: il pool chiede vitest 4. | Medio, 1-2 ore |
| `sharp`, `undici`, `ws`, `miniflare` | dipendenze interne | Alte, solo sviluppo | Si sistemano con le due righe sopra; il pool 0.23 porta con sé un wrangler 4.124, quindi qualche avviso di sviluppo può restare. | Basso |
| `zod` | 3.25.76, 4.6.7 | Alta, online (memoria esaurita con liste enormi) | Versione maggiore, nessuna correzione sulla 3. Usato in 32 file, 5 punti con API cambiate. Oggi i limiti di dimensione del corpo riducono il rischio. | Medio-alto: resta al blocco 6 |
| `drizzle-kit` (esbuild vecchio) | 0.31.11, già l'ultima | Moderata, solo per generare migrazioni | Nessuna correzione disponibile (l'audit propone di tornare alla 0.18: no). | Accettato |

## Installazione (via di Dante alle 08:30, anteprima libera)

1. `drizzle-orm` 0.45.4, `wrangler` 4.154.0, `@cloudflare/vite-plugin` 1.65.0, e `@cloudflare/workers-types` 5.20261028.1 perché lo chiede wrangler. Commit `b2413c1`.
2. `vitest` 4.1.12 e `@cloudflare/vitest-plugin` 1.4.9 al posto di `@cloudflare/vitest-pool-workers`. Commit `fe5ebbe`.
   - Il pool 0.23 non partiva: il suo motore arriva al 22/08/2026, il Worker usa la data del 15/09/2026. Il pacchetto è stato rinominato in `@cloudflare/vitest-plugin`.
   - `vitest.config.ts` con il plugin `cloudflareTest()`; tipi in `tsconfig.json` e `tests/env.d.ts` (`Cloudflare.Env`).
   - Il plugin isola i dati solo tra i file, quindi `tests/apply-migrations.ts` svuota e rimigra il database prima di ogni prova (come faceva il pool vecchio).
   - `tests/dati.test.ts`: il CSV si controlla sui byte (`text()` toglie il BOM per standard). Provato che senza BOM nel codice la prova fallisce.
   - Vitest 5 non va: il plugin lo accetta, ma il salto è stato evitato per restare stretti.
3. Browser di Playwright riscaricato (`npx playwright install chromium`): sul Mac mancava la cartella, quindi le 86 prove a schermo non partivano. Nessun cambio al repo.

## Esiti dopo l'installazione

- `npm test`: 111 file, 1.209 prove passano; prove Node 1 su 1.
- `npm run typecheck`: pulito. `npm run build`: pulita (resta l'avviso sul pacchetto sopra 500 kB).
- `npm audit --omit=dev`: 1 voce alta, `zod` (blocco 6).
- `npm audit` completo: da 16 a 9 voci, nessuna critica; restano `zod` e l'esbuild vecchio di `drizzle-kit` (solo migrazioni, nessuna correzione disponibile).
- `npm run e2e`: 84 passano, 2 saltate di proposito (una sola larghezza per quelle prove).
- Anteprima 5210: mai riavviata, risponde (pagina e `/api/health`). Gira ancora con i moduli caricati prima dell'install: al prossimo riavvio prende quelli nuovi.

## Resta

- `zod` 4: blocco 6.
- Push su `diego acceleriamo-os` a fine lavori, dopo il collaudo.

## Seguiti notati, non fatti

- 20 risorse nuove nel file del wiki senza grafiche nel gestionale (`npm run risorse:grafiche`): lavoro di contenuto, da decidere.
- Avviso della build sul pacchetto sopra 500 kB: non urgente.

# Blocco 1 (contratto: wiki `companies/acceleriamo/miglioramenti/2026-10-26-audit-gestionale/collaudo-fable-lead.md`, sezione 10)

Avvio 28/10/2026, Silvio (sviluppatore). Base: `da8734b` (merge dei 4 commit del risponditore arrivati su `diego/acceleriamo-os`: autore Tommaso, non Diego, file solo `worker/risponditore`, `worker/cron.ts` e prove; nessun conflitto, quindi niente stop).
Anteprima: `CLOUDFLARE_ENV=demo npx vite --port 5210`, log in `qa/anteprima.log`. Screenshot in `qa/blocco-1/`.
Regola: un commit per modifica, "blocco 1, modifica N: ...". Niente push. La 24 (collaudo finale) la lancia Dante.

| N | Modifica | Commit | Esito | Resta |
|---|---|---|---|---|
| 1 | Funzione unica: `worker/processo/processo.ts` (`prossimaAzione`), `transizione.ts` (`transizione`), `leggi.ts` (aggiunge `prossima` a elenco e scheda); `motore.ts` ora involucro | vedi git log | OK: `tests/processo.test.ts` 10/10 (una per fase + invariante + colori), motore/esito/call 68 verdi, typecheck pulito; nel browser 32 lead aperti, 0 senza azione | Ruling: la scadenza resta salvata in `nextActionAt` (la scrive la transizione); `prossimaAzione` la legge e decide testo, pulsante, colore. Costo se sbagliato: un campo derivato in più da tenere allineato. La scheda vecchia legge già `prossima`; tabella e Oggi la useranno con le modifiche 18 e 22 |
| 2 | Scadenze: prima chiamata 30 minuti in orario (migrazione `0018_blocco1.sql`, anche colonne `no_show` e `owner_manual` per le modifiche 3 e 6), preventivo entro 2 giorni lavorativi a fine orario, pausa di 2 mesi dopo il quinto tentativo e poi 80 "mai_risposto", evento `cambio_fase` con azione di base per fase | vedi git log | OK: processo 13/13, motore 32/32; aggiornate 5 prove che fissavano lo SLA a 120 (avvisi, cron con SLA 120 nello scenario, migrazione, oggi-unico, today); browser: lead creato alle 09:08 scade alle 09:38 | Ruling: `oreProposta` (regola 24/48 ore) non vale più per il preventivo, vince l'ipotesi 9. Ruling: il WhatsApp all'inizio della pausa non parte (nessun invio senza sì): resta da fare con il blocco 7, funzione 5 |

## Riorganizzazione in corsie (ordine di Tommaso via Dante, 28/10 mattina)

Dopo le modifiche 1 e 2, contratto delle interfacce fissato e committato (tipi `ProssimaAzione`, `Collegamenti`, `RigaContatto`, `MOTIVI_PERSI`, campi `noShow`/`ownerManual` nelle risposte, rotte `/commerciale/lead` e `/commerciale/call/:id` già registrate con segnaposto). Divisione e proprietà dei file in `qa/blocco-1/corsie.md`.

| Corsia | Agente | Ramo | Porta | Modifiche | Stato |
|---|---|---|---|---|---|
| A regole nel worker | Silvio | blocco1-corsia-a | 5211 | 3, 4, 6, 7 (worker), 12 (worker) | lanciata |
| B scheda del lead | Damiano | blocco1-corsia-b | 5212 | 7 (foglio), 10, 11, 12 (fogli), 13, 14, 15, 16, 17 | lanciata |
| C tabella e Oggi | Damiano | blocco1-corsia-c | 5213 | 18, 19, 20, 21, 22 | lanciata |
| D gestione CRM | Silvio | blocco1-corsia-d | 5214 | 5, 8, 9 | lanciata |

Dopo l'unione: 23 (passata UI, Damiano) sul ramo unito, poi test, typecheck, build, e2e e foto sull'anteprima 5210. 24: Dante.
