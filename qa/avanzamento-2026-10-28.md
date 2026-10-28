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

## Da fare quando Dante dà il via (anteprima libera)

1. `npm install drizzle-orm@^0.45.4 wrangler@^4.154 @cloudflare/vite-plugin@^1.65`, poi test, typecheck, build. Commit.
2. `vitest@~4.1.12` e `@cloudflare/vitest-pool-workers@^0.23`, riscrittura di `vitest.config.ts`, test finché verdi. Commit.
3. `npm audit --omit=dev`: atteso solo l'avviso su `zod`.
4. `npm run e2e` (Playwright) a fine giro.
5. Push su `diego acceleriamo-os` solo a fine lavori, dopo il collaudo.

## Seguiti notati, non fatti

- 20 risorse nuove nel file del wiki senza grafiche nel gestionale (`npm run risorse:grafiche`): lavoro di contenuto, da decidere.
- Avviso della build sul pacchetto sopra 500 kB: non urgente.
