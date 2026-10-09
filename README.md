# Acceleriamo OS

Il gestionale interno di Acceleriamo: raccoglie i lead (da Meta o inseriti a mano), li mostra in una scaletta per fasi e li accompagna fino alla chiusura. È online ed è usato da Tommaso e Diego.

Indirizzo: https://acceleriamo-os.acceleriamo-os.workers.dev

## Cosa fa il rilascio 1A

- Accesso con nome utente e password (due utenti: tommaso e diego).
- Lead da Meta (modulo istantaneo) e lead inseriti a mano, con segnalazione dei possibili doppioni.
- Scaletta per fasi con schede trascinabili e filtri.
- Scheda del lead: dati, storico, prossima azione, documenti come link.
- Pagina "Oggi": azioni in scadenza, lead nuovi non toccati, lead fermi da più di 7 giorni.
- Cestino per i lead eliminati.

Il rilascio 1B aggiungerà, con Claude, la scheda azienda automatica e il coach della call. Il database è già pronto per accoglierli.

## Come funziona (in breve)

Tutto gira su Cloudflare, piano gratuito: un Worker (il codice del server, cartella `worker/`) e un database D1 chiamato `acceleriamo-os` (Europa occidentale). L'interfaccia è in React (cartella `src/`). Ogni 15 minuti un controllo automatico recupera i dati dei lead Meta rimasti incompleti.

## Avvio in locale

Serve Node.js. Dalla cartella del progetto:

```bash
npm install
npm run db:migrate:local
npx tsx scripts/create-user.ts tommaso "Tommaso"
npm run dev
```

`create-user.ts` chiede la password, scrive un file `create-user-<utente>.local.sql` e stampa il comando `wrangler` da lanciare per applicarlo. Lancia quel comando, poi cancella il file `.sql`. Quando il programma parte, apri l'indirizzo che mostra il terminale.

## Test e controlli

```bash
npm test          # test automatici
npm run typecheck # controllo dei tipi
npm run build     # compilazione
```

## Mettere online

Servono due variabili d'ambiente con le credenziali Cloudflare (chiave API e identificativo dell'account), da esportare nel terminale prima dei comandi `wrangler`:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run db:migrate:remote   # solo se ci sono migrazioni nuove
npm run deploy
```

La chiave non sta nel repo e non va mai scritta in un file del progetto.

## Segreti

I segreti stanno solo in Cloudflare, mai nel repo. Quelli usati per la connessione con Meta sono:

- `META_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_PAGE_TOKEN`

Si impostano uno alla volta, e il valore si digita quando il comando lo chiede:

```bash
npx wrangler secret put META_VERIFY_TOKEN
```

In locale eventuali valori di prova vanno in `.dev.vars`, che è escluso da git.

## Aggiungere un utente

Come in locale, ma per il database online si usa `--remote` al posto di `--local` nel comando che lo script stampa:

```bash
npx tsx scripts/create-user.ts <utente> "<Nome>"
```

Poi lancia il comando stampato (con `--remote`) e cancella il file `create-user-<utente>.local.sql`.

## Cartelle

- `worker/`: server (accesso, lead, fasi, Meta, pagina Oggi)
- `src/`: interfaccia
- `drizzle/`: migrazioni del database
- `scripts/`: creazione utenti e passaggio dati dal vecchio prototipo
- `tests/`: test automatici
