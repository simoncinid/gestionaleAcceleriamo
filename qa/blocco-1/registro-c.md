# Registro corsia C (Damiano, designer)

Modifiche 18, 19, 20, 21, 22. Ramo `blocco1-corsia-c`.
Chiusura: `npm test` 111 file, 1218 prove verdi; `npm run typecheck` pulito; e2e 84 passate, 2 saltate (porta 5233).

| N | Commit | Esito | Cosa resta |
|---|---|---|---|
| 18 | df273e3 | Fatta: tabella Lead al posto della Scaletta, `/commerciale/scaletta` porta a `/commerciale/lead`, colonna Ultimo contatto dal worker | Allineare i colori delle fasi ai token della passata UI 23 |
| 19 | fabb690 | Fatta: segmenti Aperti, Scaduti, Chiusi; ricerca; filtri nell'indirizzo; ordinamento con aria-sort; foglio Filtri al telefono | Nessuno |
| 20 | da1de82 | Fatta: fase dalla cella con Annulla, Chiama e WhatsApp, menu della riga (esito, call, responsabile, cestino) | Codici azione da allineare alle API della corsia A dopo l'unione |
| 21 | 8e51c57 | Fatta: Esporta CSV (BOM, punto e virgola, 17 colonne, date di Roma), titolo 24 px al telefono | Nessuno |
| 22 | caeeb06, 1cde745 | Fatta: Oggi lista sola "Da fare oggi", Miei o Tutti, Call di oggi, Lavori; badge col numero intero; e2e aggiornati, bersagli da 44 px | Riga "Da fare" da allineare a quella della scheda (corsia B); titoli e conteggi da rivedere col seed a 11 lead (corsia D); riferimenti e2e da rigenerare dopo l'unione |

## Ruling

1. Larghezze delle colonne riviste (Azioni 10% invece del 5%: tre bersagli da 32 px non ci stanno). Costo se sbagliato: un array.
2. La parola "oggi" in #B8431C invece di #EC5E2D, per il contrasto 4.5:1 sul crema. Costo: un token.
3. Filtro in più "Scadenza: Entro oggi" (`scad=oggi`) per rendere verificabile Oggi = tabella. Costo: una voce del filtro.
4. "Miei" vuol dire responsabile uguale all'utente; i lead senza responsabile stanno solo in Tutti e nel filtro "Nessuno". Costo: una condizione nel worker.
5. GET `/api/leads` arricchita con `ultimoContatto` (file nuovo `worker/leads/ultimo-contatto.ts`). Costo: un campo.
6. "Scaduta da" solo per lo stato scaduto, così la parola non contraddice il segmento Scaduti. Costo: una funzione.
7. Lunedì e Diario restano raggiungibili da indirizzo e ricerca finché il diario non entra in Numeri; "Call di oggi" è agenda, un lead può stare lì e nella lista; un solo pulsante pieno in Oggi (prima riga). Costo: due voci di menu.
8. Oggi toglie anche numeri del giorno, fermi e fine pausa (lista sola); i testi lunghi dei pulsanti si troncano a 390 px (proporre testi più corti, es. "Segna com'è andata la presentazione"). Costo: testi del processo.
9. "Non si è presentato" apre la scheda: in questo ramo non c'è la rotta no-show. Costo: un collegamento dopo l'unione con A.
10. Icone Chiama e WhatsApp della tabella da 32 px in riga da 44, invece del componente Contatto. Costo: un componente.
11. Riga di Oggi e cella azienda della tabella cliccabili per intero (link esteso a tutta la riga), segmenti alti 44 px al telefono, per i bersagli minimi del controllo e2e. Costo: tre classi.

## Foto (qa/blocco-1/)

18-lead-1440, 18-lead-390, 19-filtri-1440, 19-filtri-390, 20-tendina-1440, 20-menu-1440, 20-foglio-1440, 20-foglio-390, 21-csv-1440, 21-csv-390, 21-telefono-390, 22-oggi-1440, 22-oggi-390.
