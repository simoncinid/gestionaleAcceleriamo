# Blocco 1: corsie parallele e contratto delle interfacce

Scritto da Silvio (sviluppatore) il 28/10/2026, dopo le modifiche 1 e 2 (commit `4363914`, `537b045`) e il commit del contratto.
Legge del blocco: il contratto di design nel wiki,
`/Users/tommasorovini/agente/companies/acceleriamo/miglioramenti/2026-10-26-audit-gestionale/collaudo-fable-lead.md`
(sezione 10 = le 24 modifiche). Dove il contratto e il codice non combaciano vince il contratto; se una cosa è impossibile,
si scrive nel registro della corsia e si va avanti.

## Le corsie

| Corsia | Agente | Worktree e ramo | Porta | Modifiche |
|---|---|---|---|---|
| A, regole nel worker | Silvio | `../acceleriamo-os-corsia-a`, `blocco1-corsia-a` | 5211 | 3, 4, 6, 7 (parte worker), 12 (parte worker) |
| B, scheda del lead | Damiano | `../acceleriamo-os-corsia-b`, `blocco1-corsia-b` | 5212 | 10, 11, 12 (fogli), 7 (foglio motivo), 13, 14, 15, 16, 17 |
| C, tabella e Oggi | Damiano | `../acceleriamo-os-corsia-c`, `blocco1-corsia-c` | 5213 | 18, 19, 20, 21, 22 |
| D, gestione CRM | Silvio | `../acceleriamo-os-corsia-d`, `blocco1-corsia-d` | 5214 | 5, 8, 9 |

Dopo l'unione, sul ramo `acceleriamo-os`: 23 (passata UI, Damiano) e i controlli finali. La 24 la lancia Dante.

## Chi possiede quali file (non toccare quelli degli altri)

- **A**: `worker/processo/processo.ts`, `worker/processo/transizione.ts`, `worker/regole/*`, `worker/leads/esito.ts`,
  `worker/calls/service.ts`, `worker/calls/ics.ts`, `worker/posta/*`, `worker/impostazioni/*`, `src/pagine/impostazioni/Fasi.tsx`;
  in `worker/leads/service.ts` solo `updateLead`, `assertMotivo`, `azioniMultiple`; in `worker/leads/routes.ts` solo PATCH `/:id`, PATCH `/:id/esito`, GET `/:id/proposta` e la rotta nuova POST `/:id/no-show`.
- **B**: `src/pagine/commerciale/SchedaLead.tsx`, `src/pagine/commerciale/lead/*`, `FoglioEsito.tsx`, `FoglioFissaCall.tsx`, `FoglioCall.tsx`,
  `FoglioChiusura.tsx`, `src/pagine/commerciale/esito.ts`, `scheda.ts`, `SezioneSchedaAzienda.tsx`, `CoachCall.tsx`, `SezioneCall.tsx`, `SezioneProposta.tsx`, `StepperFasi.tsx`,
  `SchedaCliente.tsx`, `DettaglioProposta.tsx`, `Call.tsx`, `DettaglioCall.tsx`, `src/pagine/automazioni/Scheda.tsx`, `src/pagine/economia/Canoni.tsx`,
  file nuovi `worker/leads/collegamenti.ts` e `worker/calls/dettaglio.ts`; in `worker/leads/routes.ts` solo la riga che monta GET `/:id/collegamenti`; in `worker/calls/routes.ts` solo GET `/:id`.
- **C**: `src/pagine/commerciale/Lead.tsx` (e file nuovi accanto), `Scaletta.tsx`, `filtriScaletta.ts`, `AzioniScaletta.tsx`, `tavolo.ts`, `FoglioFiltri.tsx`,
  `Oggi.tsx`, `RigaOggi.tsx`, `SegmentiOggi.tsx`, `BloccoAdesso.tsx`, `Lunedi.tsx`, `Diario.tsx`, `MenuRapido.tsx`, `src/guscio/*`, `worker/today/*`, `worker/badge/*`;
  in `src/App.tsx` solo le righe di Scaletta, Lunedì, Diario (le rotte `/commerciale/lead` e `/commerciale/call/:id` ci sono già).
- **D**: `scripts/demo-dati.ts`, `scripts/seed-demo.ts`, `worker/leads/validation.ts`, in `worker/leads/service.ts` solo `createLead`, `findDuplicate`, `softDeleteLead`, `restoreLead`, `mergeLeads`
  e una funzione nuova per "elimina per sempre"; in `worker/leads/routes.ts` solo POST `/`, `/trash`, DELETE `/:id`, `/:id/restore` e una rotta nuova DELETE `/:id/per-sempre`;
  `worker/meta/*`, `worker/foglio/*`, `worker/dati/*`, `worker/posta/sito*` se esiste, `src/pagine/impostazioni/ImportaCsv.tsx`, `src/pagine/impostazioni/Cestino.tsx`, `src/pagine/commerciale/FoglioNuovoLead.tsx`.
- Le prove (`tests/`): ognuno scrive file nuovi con il prefisso della corsia (`tests/b1a-*.test.ts`, `b1b-`, `b1c-`, `b1d-`) e sistema solo le prove vecchie rotte dai suoi file.
- Nessuno tocca `worker/db/schema.ts` né `drizzle/`: le colonne del blocco (`no_show`, `owner_manual`) ci sono già (migrazione 0018). Se serve davvero un'altra colonna, si scrive nel registro della corsia e la aggiunge Silvio all'unione.

## Interfacce fissate (già nel ramo)

- `worker/processo/processo.ts`: `prossimaAzione(lead, adesso, regole?)` restituisce `ProssimaAzione` =
  `{ azione, scadenza, stato: "scaduto"|"oggi"|"futuro"|null, pulsante: {testo, codice}|null, secondarie: {testo, codice}[], responsabile: "primaChiamata"|"presentazione"|null, poi, tentativo, massimoTentativi }`.
  I codici (`CodiceAzione`): chiama, apri_videochiamata, segna_consulenza, segna_presentazione, segna_preventivo, segna_esito, fissa_consulenza, fissa_presentazione, sposta_call, non_presentato, segna_decisione, rimanda, apri_cliente, riapri.
  `statoScadenza`, `dataTesto`, `nomeDi`, `FASE`, `FASI_APERTE` esportati. Tipi anche da `src/types.ts`.
- Ogni lead di GET `/api/leads` e GET `/api/leads/:id` ha già il campo `prossima` (calcolato da `worker/processo/leggi.ts`, `conProssima`), più `noShow`, `ownerManual`, `pausedUntil`, `lostReason`.
  Oggi e il badge devono usare `conProssima` (stessa funzione), non ricalcolare.
- `worker/processo/motivi.ts`: `MOTIVI_PERSI` (prezzo, mai_risposto, no_show, concorrente, non_ora, altro), `MOTIVI_CON_DATA` (non_ora), `MOTIVI_CON_TESTO` (altro).
- `worker/leads/collegamenti-tipi.ts`: tipo `Collegamenti` (risposta di GET `/api/leads/:id/collegamenti`) e `RigaContatto`.
- Rotte frontend già registrate in `src/App.tsx`: `/commerciale/lead` (segnaposto `Lead.tsx`, corsia C) e `/commerciale/call/:id` (segnaposto `DettaglioCall.tsx`, corsia B).

## API che la corsia A consegna (B e C costruiscono contro queste)

- PATCH `/api/leads/:id/esito`, corpo `{ requestId, esito, lostReason?, lostNote?, recontactAt?, note?, data?, call?: { kind, scheduledAt, meetLink } }`:
  fase, azione e scadenza le calcola il server con `transizione`. `stageId`, `nextAction`, `nextActionAt` restano accettati ma non servono più.
  `data` = giorno detto dal cliente (richiamare). Motivo obbligatorio per andare in 80 (422 "Scegli il motivo"); `non_ora` chiede `recontactAt`, `altro` chiede `lostNote`.
- PATCH `/api/leads/:id` con `{ stageId }` (fase scelta a mano): azione e scadenza dalla `transizione` (evento `cambio_fase`), non servono più nel corpo.
  Fasi 30 e 50 vogliono `callAt` (come oggi); 80 vuole `lostReason`. Con `{ ownerId }` il responsabile diventa manuale (`ownerManual = true`).
- POST `/api/leads/:id/no-show` `{ kind: "conoscenza"|"presentazione" }`: regola del no-show (sezione 2).
- Esiti per fase: `src/pagine/commerciale/esito.ts` `esitiPerFase` (corsia B lo allinea alla tabella: in 10 e 20 niente "Presentazione fatta").

## API che la corsia B fa da sé (modifica 13)

- GET `/api/leads/:id/collegamenti` restituisce `Collegamenti`.
- GET `/api/calls/:id` restituisce la call con `{ call, contatto: RigaContatto }` per la pagina `/commerciale/call/:id`.

## Regole per ogni corsia

1. Lavori solo nel tuo worktree. `node_modules` è un collegamento a quello del repo principale (non reinstallare).
2. Anteprima tua: `CLOUDFLARE_ENV=demo npx vite --port <porta>`, log in `qa/anteprima-<corsia>.log` (non in /tmp, non committarlo);
   prima `npx wrangler d1 migrations apply acceleriamo-os-demo --env demo --local` e `DEMO_PASSWORD=anteprima-locale-26 npm run demo:locale`.
   Foto: `BASE=http://localhost:<porta> node qa/blocco-1/foto.mjs <percorso> <NN-nome> [passi.mjs]` (1440 e 390, controlla lo scorrimento laterale).
3. Un commit per modifica, "blocco 1, modifica N: ..." in italiano, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Niente push, mai `main`, mai il ramo `acceleriamo-os`.
4. Dopo ogni modifica: le prove relative verdi e `npm run typecheck` pulito. Alla fine della corsia: `npm test` completo verde.
5. Registro della corsia: `qa/blocco-1/registro-<corsia>.md` (una riga per modifica: numero, commit, esito, cosa resta, eventuali "Ruling:").
6. Segreti mai nel codice né nei log. Nei testi dell'interfaccia niente lineette lunghe: due punti, virgole o parentesi.
7. Regole di Tommaso per le schermate: poche sezioni nette ognuna in un contenitore con titolo, una sola azione primaria per schermata,
   pulsanti con testi specifici ("Chiama Marco", mai "Conferma"), selettori a espansione (riga chiusa con valore e freccia, aperta una voce per riga),
   segmenti solo a 2-3 voci, niente gradienti, ombre, emoji, avatar, popup del browser. Brand: arancione `#EC5E2D`, crema `#F7F2EC`, testo `#1C1915`, Inter
   (Degular solo nel nome Acceleriamo). Scala e colori di stato: sezione 6 del contratto.
