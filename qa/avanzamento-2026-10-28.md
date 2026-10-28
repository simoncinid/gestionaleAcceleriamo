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
| A regole nel worker | Silvio | blocco1-corsia-a | 5211 | 3, 4, 6, 7 (worker), 12 (worker) | in corso (agente partito 28/10) |
| B scheda del lead | Damiano | blocco1-corsia-b | 5212 | 7 (foglio), 10, 11, 12 (fogli), 13, 14, 15, 16, 17 | in corso (agente partito 28/10) |
| C tabella e Oggi | Damiano | blocco1-corsia-c | 5213 | 18, 19, 20, 21, 22 | in corso (agente partito 28/10) |
| D gestione CRM | Silvio | blocco1-corsia-d | 5214 | 5, 8, 9 | in corso (agente partito 28/10) |

Dopo l'unione: 23 (passata UI, Damiano) sul ramo unito, poi test, typecheck, build, e2e e foto sull'anteprima 5210. 24: Dante.

## Ramo di Diego avanzato (nota del 28/10)

- `diego/acceleriamo-os` è a `33ca9e8` (5 commit del 28/10 mattina dal worktree `acceleriamo-os-restyling`: risponditore, pagina risorsa, SEO e robots.txt delle risorse, prove delle risorse; 217 file). La nostra unione `da8734b` arrivava a `774a5d2`.
- File in comune col nostro ramo: solo `worker/db/schema.ts` (colonna `risorse.seo`, nessun conflitto di righe atteso), `drizzle/meta/_journal.json`, `drizzle/meta/0018_snapshot.json`.
- Conflitto vero: due migrazioni 0018 (`0018_risorse_seo.sql` di Diego, `0018_blocco1.sql` nostra). Ruling: all'unione la nostra diventa `0019_blocco1.sql` con snapshot e journal rigenerati dopo la 0018 di Diego, perché il suo ramo è quello pubblicato e la nostra non è mai uscita dal Mac. Costo se sbagliato: rinominare una migrazione locale. I D1 locali (demo) che hanno già la nostra 0018 vanno ricreati da zero prima delle prove.
- Ordine all'unione: prima `git merge diego/acceleriamo-os` nel ramo `acceleriamo-os`, poi le quattro corsie, poi test, typecheck, build, e2e. Niente push.

## Modifica 25: percorso di vendita a cinque chiamate (ordine di Tommaso via Dante, 28/10)

- Dove: nella fase di unione, dopo il merge di Diego e delle quattro corsie, prima delle prove finali. La fa Silvio (sviluppatore); i testi di scheda e tabella li ricontrolla Damiano (designer) nella 23.
- Ruling: non la passo alla corsia A, che è ancora aperta (modifiche 3, 4, 6 chiuse), perché un agente già partito non riceve messaggi e perché tutte e quattro le corsie lavorano sugli id di fase e sui tipi di call di oggi: cambiarli a metà romperebbe tre rami in parallelo. Costo se sbagliato: un giro in più di prove dopo l'unione.
- Migrazione: `0020_percorso_cinque_call.sql` (0018 è di Diego, 0019 sarà la nostra `blocco1`). Gli id restano stringhe; cambiano etichetta e ordine, più tre fasi nuove.
- Mappa vecchio → nuovo:

| Fase | id | Prima | Dopo |
|---|---|---|---|
| 10 | da-chiamare-prima-volta | Nuovo, da chiamare | invariata |
| 20 | da-richiamare | Da richiamare | invariata |
| 30 | appuntamento-confermato | Consulenza fissata | Conoscenza fissata |
| 35 | in-attesa-preventivo | In attesa preventivo (40) | In attesa offerta: "Prepara l'offerta con la forbice" entro 2 giorni lavorativi |
| 40 | presentazione-confermata | Presentazione fissata (50) | Offerta fissata: call dell'offerta, poi "Fissa la call di analisi" |
| 45 | analisi-fissata (nuova) | | "Fai l'analisi" alla data della call, no-show come le altre |
| 50 | in-attesa-progetto (nuova) | | "Prepara il progetto" entro 3 giorni lavorativi |
| 55 | progetto-fissato (nuova) | | "Presenta il progetto e chiudi" alla data della call |
| 60 | in-attesa-decisione | In attesa decisione | invariata, ci si arriva dopo "Progetto presentato" |
| 70, 80, 90 | chiuso, non-chiuso, fake | | invariate |

- Tipi di call: `conoscenza`, `offerta` (ex `presentazione`, i dati vecchi aggiornati dalla migrazione), `analisi`, `progetto`. La chiamata di qualifica resta un tentativo, non una call.
- Da toccare: `prossimaAzione` e `transizione` (tabella delle fasi, esiti per fase, ruoli: 10-30 primaChiamata, 35-60 presentazione salvo diversa indicazione), enum `calls.kind`, `esitiPerFase`, fogli della call (4 tipi), pallini e filtri della tabella, seed demo a 12 lead (uno per fase), prove.
- Il contratto `collaudo-fable-lead.md` lo aggiorna Dante (direttore).

## Fase di unione

- Passo 1 chiuso: unione di `diego/acceleriamo-os` (`33ca9e8`) nel commit `ca31c52`. Conflitto solo sulle migrazioni: tenute `0018_risorse_seo` e meta di Diego, la nostra rigenerata con drizzle-kit come `0019_blocco1.sql` (stesse due colonne più l'UPDATE della regola sla-prima). Typecheck pulito, `npm test` 1231/1231 più 1/1.
- I D1 locali che avevano la vecchia 0018_blocco1 vanno ricreati prima delle prove finali.
- Le corsie le ha rimesse in moto Dante (direttore) dopo la caduta di rete; attendo che chiudano (script `qa/blocco-1/attendi-corsie.sh`).
- Corsia D chiusa (`a2d3c32`, `76ffb49`, `4bcd194`, 1259 prove verdi). Seguiti da fare in unione: `worker/cron.ts` chiama `togliScaduti` (cestino a 30 giorni); modulo del sito in `worker/posta/service.ts` passa da `ingressoLead`; colori fasi 20 e 60 come da contratto; foto di `schermate.spec.ts` da rifare; riga 9 del registro con `4bcd194`. Conflitti attesi con A su `tests/dati.test.ts`, `tests/leads.test.ts`. Nella 25 seed con `demo-lead-35`, `-45`, `-55`.
- Corsia A chiusa (`b48e182`, `1f3a8d3`, `05004d9`, `ff97d94`, `5a61b36`, 1261 prove verdi). Seguiti in unione: togliere `RiordinaFasi.tsx` e `regole.ts` non più usati; A ha toccato anche `controlli.ts`, `stages/routes.ts`, `funnel.ts`; tipo attività `invito_proposta` aggiunto allo schema senza migrazione: va nella `0020` della 25; seed della 25 con secondo utente (Diego e Tommaso) se manca.
- Passo 2 chiuso: unite corsia A (merge senza conflitti) e corsia D (conflitti solo negli import di `worker/leads/routes.ts` e `service.ts`, tenuti entrambi). Typecheck pulito, vitest 1289/1289.
- Passo 3 chiuso (seguiti di A e D): giro `cestino` alle 6:30 nel cron con `togliScaduti` (prova in `tests/cron.test.ts`); modulo del sito passa da `ingressoLead` (prova in `tests/posta.test.ts`); tolto `RiordinaFasi.tsx`. Ruling: `src/pagine/impostazioni/regole.ts` resta, perché `integrazioni-sezioni.tsx` usa ancora `daLinkFoglio`, `leggiFinoAllaFine`, `linkDelFoglio`; costo se sbagliato: qualche funzione morta nel file. Colori delle fasi 20 e 60 e foto di `schermate.spec.ts`: dentro la 25 e alla fine. Riga 9: commit `4bcd194` (cestino), più `blocco 1, modifica 9 (seguito)` per il cron.
- Decisioni di Tommaso per la 25 (via Dante, definitive): (1) 10 e 20 responsabile Diego (primaChiamata); dalla 30 in su responsabile Tommaso (presentazione) e ogni call ha entrambi come partecipanti nell'invito. (2) "Prepara l'offerta" scade 3 giorni lavorativi dopo la conoscenza, la call dell'offerta va fissata entro 4; stesso schema analisi → progetto (prepara entro 3, call entro 4); decisione come prima. (3) Forbice: due numeri "da" e "a" sulla proposta di tipo offerta, nessun calcolo. (4) Lead in "Presentazione fissata" diventano "Offerta fissata" (mappa invariata).
- Corsia B chiusa (`76e3cc7`..`6abe210`, 1265/1266: `tests/coach.test.ts` "Applica e poi esito Non interessato" aspetta il server di A). Seguiti: dopo l'unione ricontrollare no-show, conferma inviti, `lostNote`, `recontactAt`, `ESITI_PER_FASE` dal worker nella scheda; riga del contatto nel foglio del canone (`economia/Fogli.tsx`, componente `ContattoDalCliente`); nel seed allineare la data del cliente al lead chiuso (nella 25); passata `impeccable` ed `emil-design-eng` nella 23 da Damiano (designer) sulle foto finali.
- Corsia C chiusa (`df273e3`, `fabb690`, `da1de82`, `8e51c57`, `caeeb06`, `1cde745`, `3ce7313`; 1218 prove, e2e 84). Seguiti: riga "Da fare" di Oggi come quella della scheda; "Non si è presentato" collegato a `/api/leads/:id/no-show`; titoli e conteggi col seed a 12; token colori nella 23; riferimenti e2e da rigenerare. Ruling di C tenuti: "Miei" = responsabile uguale all'utente; filtro "Entro oggi"; "oggi" in #B8431C.
- Specifica della 25: `qa/blocco-1/modifica-25.md`.
- Modifica 25 chiusa (`fe20e96` server e migrazione 0020, `c30dc73` interfaccia, `89f6bee` demo). Esito: vitest 1348/1348 (131 file), typecheck pulito, build ok; demo locale ricreata (D1 demo cancellato, migrazioni fino alla 0020, seed) e anteprima 5210: i 12 lead `demo-lead-<fase>` hanno azione e pulsante della tabella (foto `qa/blocco-1/25-lead-*` e `25-scheda-45-*`). Seguiti fatti: `ESITI_PER_FASE` in `worker/leads/esiti-per-fase.ts` (copia unica, importata da worker e scheda senza portare il server nel bundle); "Non si è presentato" da Oggi e dal menu della tabella chiama `/api/leads/:id/no-show` con il tipo della fase (hook `nonPresentato.ts`, uno per scheda, Oggi e tabella); Oggi usa `CALL_DEL_CODICE` e i codici nuovi, nessun ricalcolo.
- Ruling della 25 (costo se sbagliato): (1) inviti con Diego e Tommaso partecipanti NON fatti: `users` non ha email, serve colonna e interfaccia (inviti senza i due interni finché non si aggiunge). (2) Conoscenza fatta con la call dell'offerta già fissata nello stesso foglio va in 40, senza: 35 (un passaggio in meno nello storico). (3) Proposta segnata "presentata" alla call dell'offerta fatta (se Tommaso la vuole presentata solo al progetto, cambia una riga in `calls/service.ts`). (4) In 35 "Fissa la call dell'offerta" è di Tommaso, non più di Diego. (5) Errori di validazione Zod della forbice rispondono 400 come il resto dell'app, non 422. (6) Testi vecchi di `next_action` salvati nel DB riscritti dalla 0020. (7) `invito_proposta` è solo un valore TS su colonna testo: nessun SQL. (8) Lead demo 35 ha la proposta con forbice come da spec, quindi mostra "Fissa la call dell'offerta" e non "Segna l'offerta pronta" (quella riga si vede nel lead 50 per il progetto). (9) Con "Offerta presentata" la call di analisi nel foglio esito è facoltativa; l'invito parte solo se c'è la data. (10) `CALL_SEGUENTE` spostata in `worker/regole/fasi-call.ts`, usata da server e foglio della call (campo `prossima`).
- Resta della 25: email degli utenti per gli inviti a Diego e Tommaso; foto e riferimenti e2e da rigenerare (e2e non lanciati); `tests/b1a-fasi-sola-lettura` e Impostazioni > Fasi hanno descrizioni scritte a mano delle 12 fasi, da rileggere con Tommaso.
- Correzioni prima del push: Riccardo (revisore e sicurezza) punto 1 chiuso dalla 25 (typecheck a zero); punto 2 lead riaperto con lo SLA delle Impostazioni (`scadenzaPrimaChiamata`, prova in `b1d-doppioni`); punto 3 conferma dell'invito una volta sola e mai per lead nel cestino (prova in `b1a-inviti`). Corrado (collaudatore): "Non si è presentato" solo dall'ora della call, server 422 prima (prove in `processo`, `b1a-no-show`).
- Prove finali: vitest 1352/1352, typecheck pulito, build ok. e2e: oltre 5 minuti, 18 passate, 27 fallite (21 foto di `schermate.spec.ts`, più `flusso.spec.ts` e `percorso-lead.spec.ts` che cercano i pulsanti vecchi "Segna esito", "Altre azioni", "Fissa call"), 40 non partite. **Foto e2e da rifare** ed e2e dei flussi da riscrivere sui pulsanti nuovi. Nota: l'e2e rifà il seed demo con la sua password, dopo va rilanciato `DEMO_PASSWORD=anteprima-locale-26 npm run demo:locale`.
- Foto finali: `qa/blocco-1/finale-scheda-1440.png`, `finale-scheda-390.png`, `finale-tabella-1440.png`, `finale-oggi-1440.png`.
- Dopo il push: minori di Riccardo (doppioni Meta nel database e altri, rapporto `revisione-riccardo-blocco1.md` nel wiki); minori di Corrado (fonte nello storico come codice "foglio_andrea", "Ultimo contatto: Mai" per lead con call fatte, casi non provati: lead delle 20:00, cambio responsabile, CSV con doppioni, risposta all'invito); la call segnata "saltata" dalla pagina Call non controlla ancora l'ora; email degli utenti per gli inviti; modifica 23 (passata UI di Damiano, designer) con troncamenti in tabella ("scaduta da..."); 24 a Dante.

# Blocco 1 bis (correzione rapida dopo la pagina Lead in produzione, ordine di Tommaso via Dante, 28/10)

1. **La pagina non arrivava in fondo** (`fac8852`). Causa: la tabella scorreva in un riquadro interno alto quanto la finestra (`max-h-[calc(100dvh-292px)]`), l'ultima riga restava a metà e la pagina non scorreva. Ora scorre la pagina, l'intestazione resta ferma in cima (sotto l'avviso della demo, variabile `--sopra-pagina`); se le colonne non ci stanno la tabella scorre di lato. Prova con la rotella vera su 55 lead: ultima riga intera a 1440. Oggi, Proposte, Clienti e scheda non avevano riquadri fissi: scorrono (misure in `bis-foto.mjs`).
2. **Da fare e Scadenza in una colonna** (`27860a2`). Testi in `prossimaAzione`: "Chiama Marco", "Richiama Luca, tentativo 2 di 5", "Call con Marco Prizzi" (30, 40, 45; 55 "Call con ..., per chiudere"), "Senti Paolo per la risposta". Sotto in piccolo la scadenza: "scaduta da 2 giorni" e "ieri 17:45" in rosso, "oggi" in #B8431C, il resto grigio. Ordinamento per scadenza sulla freccia di "Da fare".
3. **Fase come etichetta colorata** (`b331df8`). Componente unico `EtichettaFase.tsx`, colore dal `tone` della tabella `stages` (nel DB la colonna si chiama `tone`, non `color`): arancione #FCE4DA, blu, giallo, verde, grigio, bordo più scuro, 24 px, testo #1C1915. Nella tabella resta il pulsante con la freccia (modifica 20). Stesso aspetto in scheda, Oggi, filtro Fase, foglio del cambio fase, riga del telefono. Tolti `classePallino` e `coloreFase`.
4. **Ultimo contatto** (`1fa614e`): contano anche le call (da quando sono fissate, o dall'ora se già fatte) e le note scritte da una persona; non le note automatiche.
5. **Colonne del foglio CRM LEAD** (`43c7447`). Tredici colonne in `colonneLead.ts`; di base Azienda, Telefono, Fase, Da fare, Responsabile, Ultimo contatto, Arrivato il (1103 px: stanno a 1440 senza scorrere di lato). A scelta Email, Inserzione, Settore, Attività, Offerta, Fonte. Selettore "Colonne 7 di 13" a espansione, scelta in localStorage per utente (`lead-colonne:<id>`), non più nell'indirizzo (`?col=` tolto). Punteggio e Tentativi non sono più colonne (restano nel CSV). CSV con Inserzione, Settore, Attività, Modulo. Telefono "+39 339 324 0432" anche se salvato con gli spazi.
6. **Si farà vivo lui** (`682ceca`) nel foglio Rimanda (raggiungibile in 60, In attesa decisione): 7 giorni, Da fare "Se non si è fatto vivo, richiama Paolo", storico "Aspettiamo che richiami lui". Provato nel browser sulla demo.
- Prove: vitest 1358/1358, typecheck pulito, build ok. e2e non lanciati: le foto di `schermate.spec.ts` erano già da rifare e ora cambiano ancora (tabella, etichette).
- Foto: `qa/blocco-1/bis-lead-1440.png`, `bis-lead-390.png`, `bis-lead-colonne-1440.png`, `bis-colonne-menu-1440.png`, `bis-scheda-*`, `bis-oggi-*`, `bis-rimanda-1440.png`. Demo locale con 44 lead copiati (`-bis1..4`) per provare lo scorrimento.
- Seguiti: e2e e foto di riferimento da rifare; Impostazioni > Fasi descrive ancora le azioni a mano ("Prima chiamata"), da riallineare ai testi nuovi; la scelta delle colonne non segue l'utente su un altro computer (localStorage).
