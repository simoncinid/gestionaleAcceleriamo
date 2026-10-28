# Registro corsia B (scheda del lead), blocco 1

Damiano (designer). Ramo `blocco1-corsia-b`. Una riga per modifica, poi i Ruling.

| N | Commit | Esito | Cosa resta |
|---|---|---|---|
| 10 | 76e3cc7 | Scheda in struttura B2: intestazione, cinque sezioni in contenitori, ordine 390 giusto, 1 primario. Foto `10-scheda-*` | Collegamenti arriva con la 14 |
| 11 | (vedi git log) | Da fare per fase da `lead.prossima`: primario della tabella, secondarie a testo, "Poi", tentativo solo 10 e 20, distanza colorata, link in linea Call, Proposta, Cliente, stati vuoti (link call, proposta in 40). Foglio "Sposta la call" (PATCH della call esistente). Foto `11-fase10/30/40/70/80-*` | "Non si è presentato" chiama POST `/leads/:id/no-show` della corsia A: si prova dopo l'unione |

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
