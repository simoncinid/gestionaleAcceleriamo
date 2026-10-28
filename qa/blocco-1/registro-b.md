# Registro corsia B (scheda del lead), blocco 1

Damiano (designer). Ramo `blocco1-corsia-b`. Una riga per modifica, poi i Ruling.

| N | Commit | Esito | Cosa resta |
|---|---|---|---|
| 10 | 76e3cc7 | Scheda in struttura B2: intestazione, cinque sezioni in contenitori, ordine 390 giusto, 1 primario. Foto `10-scheda-*` | Collegamenti arriva con la 14 |
| 11 | (vedi git log) | Da fare per fase da `lead.prossima`: primario della tabella, secondarie a testo, "Poi", tentativo solo 10 e 20, distanza colorata, link in linea Call, Proposta, Cliente, stati vuoti (link call, proposta in 40). Foglio "Sposta la call" (PATCH della call esistente). Foto `11-fase10/30/40/70/80-*` | "Non si è presentato" chiama POST `/leads/:id/no-show` della corsia A: si prova dopo l'unione |
| 12 | (vedi git log) | Fogli: esiti filtrati per fase come la tabella (10 e 20 telefonate, 30 consulenza, 40 preventivo pronto, 50 presentata o firmato, 60 "Sì, firma", "No, non firma", "Rimanda"); "firmato" apre il foglio della chiusura, "Rimanda" il rinvio; motivo verso 80 con i codici fissi (non_ora chiede il giorno, altro il testo), primario spento finché manca; fogli laterali a destra su schermo largo e dal basso al telefono. Foto `12-esito-fase60-*` | Il corpo con `lostNote` e `recontactAt` passa solo con lo schema della corsia A (modifica 7, `ff97d94`): prima dell'unione il server di questo ramo lo rifiuta. Provare dopo l'unione: lead in 60, "No, non firma", motivo "Non è il momento" con giorno |
| 13 | (vedi git log) | GET `/api/leads/:id/collegamenti` (`worker/leads/collegamenti.ts`, segue `clients.originLeadId`) e GET `/api/calls/:id` con la riga del contatto (`worker/calls/dettaglio.ts`); pagina `/commerciale/call/:id`: una sezione "La call", primario secondo l'ora (prima "Apri la videochiamata", dopo "Segna com'è andata"), "Sposta la call", "Scarica l'invito". Foto `13-call-*` | Nella risposta dei collegamenti c'è in più `inviti` (attività `invito_proposta` ancora da confermare): il dettaglio del lead non porta l'esito delle attività. Da verificare in unione con la corsia A |
| 12 bis | (vedi git log) | Allineamento alla corsia A (`5a61b36`): il foglio dell'esito non manda più fase, azione e scadenza (le calcola il server); mostra in sola lettura "Va in" e "Poi" dall'anteprima delle regole; "Richiamare" porta il giorno detto (`data`); esiti del foglio uguali a `ESITI_PER_FASE` del worker (copia in `esito.ts`, con una prova che li confronta) più "firmato" e "rimanda"; motivo chiesto con "Non interessato" | Da verificare in unione: dopo l'unione `esito.ts` importa `ESITI_PER_FASE` da `worker/leads/esito.ts` invece della copia. `tests/coach.test.ts` ("Applica e poi esito Non interessato") in questo ramo fallisce perché il server di B vuole ancora `stageId`: con la versione della corsia A (server e prova) passa |

## Ruling

1. Valori della sezione 6 locali in `src/pagine/commerciale/lead/stile.ts`, non nei token di `src/styles.css` (che hanno sabbia #E3DCD2, raggio 20, titoli in Degular). Costo se sbagliato: basso, la modifica 23 li sposta nei token con una sostituzione.
2. Testo "oggi" in #B8431C invece di #EC5E2D: l'arancione puro su bianco fa 3,2:1 e non regge 4,5:1; il pallino resta #EC5E2D. Costo: nullo, un valore.
3. Il foglio laterale del design system è 440 px, non 420: il `Foglio` non è della corsia B. Costo: basso, si cambia in `src/ds` con la 23.
4. Niente riga WhatsApp nei Contatti: è lo stesso numero del telefono, resta il pulsante. Costo: basso, una riga.
5. "Copia l'id per il preventivo" tenuto nel menu "...": serve al flusso del preventivo dal wiki. Costo: nullo.
6. Pulsante grande del design system a 48 px, non 44: sopra il minimo tattile. Costo: nullo.
7. `StepperFasi` tiene la prossima azione "Ricontattare" di riserva quando si riapre senza azione. Costo: basso.
8. Link in linea della call: si sceglie la call all'ora dell'appuntamento del lead, poi la prima ancora aperta. Nel demo il lead 17 ha l'appuntamento alle 8:15 di oggi ma la call aperta è venerdì: dato del seed, non della scheda. Costo: basso.
9. Nei lead chiusi la data è senza giorno della settimana ("Chiuso il 13 ottobre"): è una data passata, il giorno non serve. Costo: nullo.
10. I fogli di esito (segna consulenza, presentazione, preventivo, decisione) aprono tutti `FoglioEsito`, che con la 12 filtra gli esiti per fase.
11. In 40 resta anche "Non interessato": il lead può tirarsi indietro in ogni fase, la tabella elenca solo il passo avanti. Costo: basso, una voce.
12. In 90 il foglio della chiusura non chiede il motivo: "Non profilato" è già il motivo (come il server della corsia A). Costo: nullo.
13. `inviti` dentro la risposta dei collegamenti invece che nel dettaglio del lead: il file del contratto `collegamenti-tipi.ts` resta com'è, il tipo esteso sta in `collegamenti.ts`. Costo: basso, si sposta un campo.
