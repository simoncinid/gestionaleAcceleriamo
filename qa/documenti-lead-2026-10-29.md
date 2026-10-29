# Avanzamento 29/10/2026: documenti caricati nella scheda del lead

Spec e piano nel wiki: `_system/specs/2026-10-29-acceleriamo-os-documenti-lead-design.md` e `...-plan.md`.
Chi: Silvio (sviluppatore). Revisione: Riccardo (revisore e sicurezza). Ramo `acceleriamo-os`.

## Fatto

1. Migrazione `drizzle/0021_documenti_file.sql`: tabelle `document_versions` e `lead_visti`, colonne nuove su `documents`.
   I link già presenti non accendono il pallino (riga in `lead_visti` per ogni persona).
2. Bucket R2 `DOCUMENTI` in `wrangler.jsonc`: `acceleriamo-os-documenti`, demo `acceleriamo-os-demo-documenti`.
3. `worker/leads/documenti.ts`: tipi ammessi (lista chiusa per estensione), limite 100 MB, caricamento in streaming,
   versioni, apertura dal Worker con intestazioni prudenti, conteggio del pallino.
4. Rotte: `POST /api/leads/:id/documents` (JSON = link, corpo grezzo = file), `POST /api/leads/:id/visto`,
   `POST|GET /api/documents/:id/versioni`, `GET /api/documents/:id/file`; lista dei lead con `novita`.
5. Script: `/api/carica/lead?q=` e `POST /api/carica/lead/:id/documenti` con `Authorization: Bearer <CARICA_TOKEN>`,
   a nome dell'utente `tommaso` con via `claude`. CLI `scripts/carica-documento.mjs` (`npm run carica`).
6. Elimina per sempre (a mano e giro dei 30 giorni) toglie anche versioni e oggetti R2.
7. Interfaccia: foglio Documenti con "Carica file" (o trascina), avanzamento disegnato, Scarica, Nuova versione,
   Versioni precedenti, "Nuovo" sulle novità; pallino arancione in lista (tabella e telefono) e su "Documenti" nella scheda.

## Prove

- `tests/documenti-file.test.ts` (9) e `tests/documenti-ui.test.tsx` (4).
- Prova vera in locale (spazio demo, `vite` con R2 emulato e `CARICA_TOKEN` di prova), log in `qa/documenti-lead-2026-10-29/`:
  - `prova-locale.log`: Diego carica un PDF, Tommaso vede il pallino 1; versione 2, pallino 2; Tommaso apre la scheda
    (novità 2), pallino 0; ultima versione e versione 1 si aprono giuste; senza sessione 401.
  - `script.log`: lo script carica per nome, come nuova versione, per id con titolo; lead inesistente esce 2,
    token sbagliato 401, http verso un host esterno rifiutato; Diego vede 3 novità, voci di Tommaso "caricato da Claude".
  - `foto.log` e foto a 1440 e 390: pallino in lista e su "Documenti", "Nuovo" nel foglio, pallino a zero dopo l'apertura.

## Revisione di Riccardo (revisore e sicurezza), 29/10/2026: via libera con correzioni, tutte applicate

1. Medio: file rimasti su R2. Elimina per sempre ora ripulisce anche la cartella `lead/<id>/` su R2.
   Resta aperto: i documenti tolti uno per uno restano su R2 (cancellazione morbida, come chiede la spec). Regola di durata da decidere con Tommaso (e Livia, legale).
2. Basso: caricamento solo con `content-type: application/octet-stream` (415 altrimenti), contro pagine di altri sottodomini.
3. Basso: `filename*` secondo RFC 5987 (apostrofi e parentesi codificati).
4. Basso: tolti dal nome i caratteri che invertono il verso del testo.
5. Basso: ricerca dello script con `%` e `_` presi alla lettera (`ESCAPE`).
6. Basso: lo script rifiuta `http` verso host diversi da localhost.
7. Basso: file e storico di un lead nel cestino non si aprono.

## Esiti finali (dopo le correzioni)

- `npm test`: 137 file, 1.403 prove passano; prove Node 1 su 1.
- `npm run typecheck`: pulito. `npm run build`: pulita (resta l'avviso noto sul pacchetto sopra 500 kB).
- `npm run e2e`: 25 passano, 2 saltate, 59 falliscono. Gli stessi 59 falliscono identici sul commit di partenza
  `040994e` (provato in una copia separata): sono le foto di riferimento ferme e i percorsi che ci dipendono
  (per esempio "Oggi" a 390 attesa alta 4900 px, arriva 1293 px). Nessun fallimento nuovo dovuto a questo lavoro.
  Da sistemare a parte: rifare le foto di riferimento (`npm run e2e:foto`) dopo averle guardate.

## Restano per la messa online (Diego)

1. Attivare R2 e creare i bucket `acceleriamo-os-documenti` e `acceleriamo-os-demo-documenti`.
2. Copia del database, `npm run db:migrate:remote` e `npm run db:migrate:demo` (migrazione 0021).
3. `npx wrangler secret put CARICA_TOKEN` e la stessa stringa nel portachiavi del Mac (`acceleriamo-carica-token`).
4. `npm run deploy` e `npm run deploy:demo`. Senza i bucket il deploy si ferma.

## Pulizia dei documenti tolti (ordine di Dante (direttore), decisione di Tommaso del 29/10/2026)

1. `worker/leads/pulizia-documenti.ts`: documenti con `deleted_at` oltre 30 giorni, prima via da R2 tutte le versioni,
   poi le righe; poi le cartelle R2 `lead/<id>/` senza lead nel database (i lead nel cestino restano).
2. Lavoro `documenti` nel giro (ogni giorno alle 6:40 di Roma, al massimo 20 unità a giro), voce "Documenti tolti
   oltre 30 giorni" nella pagina Stato, spenta senza bucket.
3. Prove: `tests/documenti-pulizia.test.ts` (4) e `tests/cron.test.ts` aggiornato. `npm test`: 1.407 su 1.407,
   typecheck e build pulite.
4. Prova vera in locale (database di produzione locale, server `vite`, giro lanciato con l'API locale di Wrangler
   alle 6:40 del 02/11/2026): `qa/documenti-lead-2026-10-29/pulizia.log`. Il documento tolto da 31 giorni sparisce con le sue
   2 versioni, quello vivo e il suo file restano, la cartella orfana su R2 sparisce, la voce dello Stato è "ok".
   Dati di prova tolti dal database locale alla fine.
5. Riccardo (revisore e sicurezza): via libera, nessun file vivo a rischio. Applicati i due bassi: elenco delle cartelle
   su più pagine (fino a 3000 cartelle a giro) e cancellazione su R2 a blocchi da 1000. Non fatto: riga nello storico
   del lead per la cancellazione definitiva (da chiedere a Tommaso se la vuole).
