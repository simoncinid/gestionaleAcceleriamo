# Blocco 1, modifica 25: percorso di vendita a cinque chiamate

Ordine di Tommaso del 28/10/2026 (via Dante, direttore), decisioni definitive. Si fa sul ramo `acceleriamo-os` dopo l'unione delle quattro corsie.
Il contratto `collaudo-fable-lead.md` lo aggiorna Dante: non si tocca.

## Il percorso

1. Qualifica al telefono (Diego): resta un tentativo, non una call. Fissa la call di conoscenza.
2. Call di conoscenza (ex "consulenza"): fissa la call dell'offerta.
3. Call dell'offerta con forbice di prezzo: fissa la call di analisi.
4. Call di analisi dettagliata: fissa la call del progetto.
5. Call del progetto nel dettaglio, con vendita in call.

## Fasi (id stringa invariati per le esistenti, cambiano etichetta e ordine)

| Ordine | id | Etichetta | Azione (prossimaAzione) | Scadenza | Responsabile |
|---|---|---|---|---|---|
| 10 | da-chiamare-prima-volta | Nuovo, da chiamare | Prima chiamata (come oggi) | come oggi | primaChiamata (Diego) |
| 20 | da-richiamare | Da richiamare | come oggi | come oggi | primaChiamata |
| 30 | appuntamento-confermato | Conoscenza fissata | "Conoscenza con Marco"; dopo l'ora "Segna com'è andata la conoscenza"; Poi: "Preparare l'offerta entro <data>" | data della call | presentazione (Tommaso) |
| 35 | in-attesa-preventivo | In attesa offerta | "Prepara l'offerta con la forbice", pulsante "Segna l'offerta pronta"; con proposta e senza call dell'offerta: "Fissa la call dell'offerta" | 3 giorni lavorativi dopo la conoscenza (= stageChangedAt); la call va fissata entro 4 giorni lavorativi dallo stesso istante | presentazione |
| 40 | presentazione-confermata | Offerta fissata | "Offerta con Marco", dopo l'ora "Segna com'è andata l'offerta"; Poi: "Fissare la call di analisi" | data della call | presentazione |
| 45 | analisi-fissata (nuova) | Analisi fissata | "Fai l'analisi con Marco", dopo l'ora "Segna com'è andata l'analisi"; Poi: "Preparare il progetto entro <data>" | data della call | presentazione |
| 50 | in-attesa-progetto (nuova) | In attesa progetto | "Prepara il progetto", pulsante "Segna il progetto pronto"; a progetto pronto: "Fissa la call del progetto" | 3 giorni lavorativi dopo l'analisi; la call entro 4 | presentazione |
| 55 | progetto-fissato (nuova) | Progetto fissato | "Presenta il progetto e chiudi", dopo l'ora "Segna com'è andata la call del progetto"; Poi: "Sentire Marco per la decisione" | data della call | presentazione |
| 60 | in-attesa-decisione | In attesa decisione | come oggi | come oggi | presentazione |
| 70, 80, 90 | chiuso, non-chiuso, fake | invariate | | | |

- Fasi con call (no-show uguale per tutte: prima assenza "Rifissare la <call>", seconda pausa di 2 mesi, poi ultima chiamata): 30, 40, 45, 55.
- `ruoloDellaFase`: 10 e 20 primaChiamata; da 30 a 70 presentazione. Il default di `presentazione` è Tommaso, di `primaChiamata` Diego (impostazioni di assegnazione); `ownerManual` vince sempre.
- Colori delle fasi (pallini, sezione 6 del contratto): arancione le fasi "da fare" (10, 20, 35, 50), blu le fasi con call fissata (30, 40, 45, 55), ocra 60, verde 70, grigio 80 e 90. Sistemare anche i toni di 20 e 60 nella tabella `stages` (segnalati dalla corsia D).

## Tipi di call

`conoscenza`, `offerta` (ex `presentazione`), `analisi`, `progetto`. Etichette: "Call di conoscenza", "Call dell'offerta", "Call di analisi", "Call del progetto".
La migrazione aggiorna le call esistenti `presentazione` → `offerta`. Tipo, enum Zod, `FASI_CON_CALL` (30 conoscenza, 40 offerta, 45 analisi, 55 progetto), `AZIONE_CALL`, coach (`SISTEMA_PRESENTAZIONE` vale per offerta; analisi e progetto usano lo stesso dell'offerta se non c'è altro), note della call (`note-call.ts`: per analisi e progetto le stesse voci dell'offerta), funnel e revisione del lunedì (una tappa per tipo di call, nomi nuovi), foglio Fissa call con i 4 tipi.
**Inviti:** ogni call dalla 30 in su ha come partecipanti entrambi (Diego e Tommaso, cioè gli utenti di `primaChiamata` e `presentazione` nelle impostazioni di assegnazione) oltre al cliente. Controllare dove si costruisce l'invito (`worker/calls/ics.ts`, `mandaInvitiInCoda`).

## Eventi ed esiti

Codici esito nuovi (si rinominano quelli vecchi; se un codice è salvato nel database, la migrazione lo aggiorna):
`appuntamento` → `conoscenza_fissata`; `consulenza_fatta` → `conoscenza_fatta`; `presentazione_fissata` → `offerta_fissata`; `presentazione_fatta` → `offerta_presentata`; nuovi `analisi_fissata`, `analisi_fatta`, `progetto_pronto`, `progetto_fissato`, `progetto_presentato`, e `offerta_pronta`.

| Esito | Fase dopo | Azione salvata e scadenza |
|---|---|---|
| conoscenza_fissata (con call) | 30 | data della call |
| conoscenza_fatta | 35 | "Preparare l'offerta", 3 giorni lavorativi |
| offerta_pronta | resta 35 | "Fissare la call dell'offerta", entro 4 giorni lavorativi da stageChangedAt |
| offerta_fissata (con call) | 40 | data della call |
| offerta_presentata | con call di analisi nel foglio: 45 alla data; senza: resta 40 con "Fissare la call di analisi" a 2 giorni lavorativi | |
| analisi_fissata (con call) | 45 | data della call |
| analisi_fatta | 50 | "Preparare il progetto", 3 giorni lavorativi |
| progetto_pronto | resta 50 | "Fissare la call del progetto", entro 4 giorni lavorativi da stageChangedAt |
| progetto_fissato (con call) | 55 | data della call |
| progetto_presentato | 60 | come l'ex presentazione_fatta (Follow-up, ricontatti) |

`ESITI_PER_FASE` (worker, unica copia: l'interfaccia la importa dal worker, via la copia in `src/pagine/commerciale/esito.ts`):
10, 20: telefonate + conoscenza_fissata + chiusure. 30: conoscenza_fatta, offerta_fissata, richiamare, non_risponde, occupato, chiusure. 35: offerta_pronta, offerta_fissata, richiamare, non_risponde, occupato, risposto, chiusure. 40: offerta_presentata, analisi_fissata, richiamare, non_risponde, occupato, chiusure. 45: analisi_fatta, progetto_fissato, richiamare, non_risponde, occupato, chiusure. 50: progetto_pronto, progetto_fissato, richiamare, non_risponde, occupato, risposto, chiusure. 55: progetto_presentato, richiamare, non_risponde, occupato, chiusure (più "firmato" nella scheda, come oggi in 50). 60: come oggi con `progetto_fissato` al posto di `presentazione_fissata`.
`CALL_DELL_ESITO`: conoscenza_fissata → conoscenza, offerta_fissata → offerta, analisi_fissata → analisi, progetto_fissato → progetto; anche offerta_presentata chiede (facoltativa) la call di analisi.
Eventi `call_fissata` e `call_fatta` per i 4 tipi (conoscenza → 35, offerta → 40 con "Fissare la call di analisi" o 45 se la call di analisi c'è già, analisi → 50, progetto → 60). `proposta_registrata` vale per la proposta dell'offerta (`haCallOfferta`). `cambio_fase` copre le fasi nuove (45 e 55 vogliono `callAt` come 30 e 40).

## Codici delle azioni (pulsanti)

Si rinominano in modo coerente: `fissa_conoscenza`, `fissa_offerta`, `fissa_analisi`, `fissa_progetto`; `segna_conoscenza`, `segna_offerta`, `segna_analisi`, `segna_progetto`; `segna_offerta_pronta`, `segna_progetto_pronto`. Aggiornare chi li legge (`SchedaLead.tsx`, `NextActionCard.tsx`, azioni di riga della tabella Lead, Oggi) e `src/types.ts`.

## Forbice

Proposta di tipo offerta: due numeri interi in centesimi, `forbiceDaCents` e `forbiceACents` (colonne `forbice_da_cents`, `forbice_a_cents`, null ammesso), nessun calcolo. Si scrivono e si leggono dove si crea e si mostra la proposta; validazione: se c'è uno c'è l'altro e da <= a.

## Migrazione 0020

`drizzle/0020_percorso_cinque_call.sql` (generata con drizzle-kit dove tocca lo schema, più gli UPDATE a mano):
- etichette, `sort_order` e toni delle fasi come sopra; INSERT delle tre fasi nuove (stesse colonne delle altre, `kind = 'open'`);
- `UPDATE calls SET kind = 'offerta' WHERE kind = 'presentazione'`;
- colonne della forbice;
- tipo di attività `invito_proposta` (aggiunto dalla corsia A allo schema senza migrazione: se è solo un enum TypeScript su colonna text non serve SQL, scriverlo nel registro);
- codici esito salvati nel database, se ce ne sono, aggiornati ai nomi nuovi;
- impostazioni di assegnazione: se `presentazione` è vuoto resta com'è (lo decide il seed in demo).
Mappa vecchio → nuovo nel registro (già scritta in `qa/avanzamento-2026-10-28.md`). I lead in "Presentazione fissata" diventano "Offerta fissata" (stesso id).

## Seed demo

Dodici lead, uno per fase: id `demo-lead-<fase>` (aggiungere `demo-lead-35`, `demo-lead-45`, `demo-lead-55`; quello che oggi è in 40 "In attesa preventivo" diventa `demo-lead-35`, quello in 50 diventa `demo-lead-40`, e via così, coerenti con le call di tipo nuovo), più quello senza telefono e il doppione. Due utenti: `demo` (Diego, login della demo) e Tommaso; assegnazione `primaChiamata` = demo, `presentazione` = Tommaso. Il cliente nato dal lead 70 ha data di creazione uguale o successiva alla chiusura del lead. Il lead 35 ha una proposta di tipo offerta con forbice.

## Prove

Prima la prova che fallisce. Una prova per riga della tabella delle fasi (`tests/processo.test.ts`), una per ogni esito (`tests/b1a-*` o file nuovo `tests/b1-25-*.test.ts`), la migrazione (`tests/migrazione*`), il seed (`tests/demo*`). Le prove vecchie che cambiano per contratto si aggiornano, mai indebolite a caso.
