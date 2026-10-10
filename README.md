# Acceleriamo OS

Il gestionale interno di Acceleriamo: raccoglie i lead (da Meta, dal Foglio Andrea o inseriti a mano), li accompagna fino alla chiusura e tiene i conti leggeri del ricorrente. È online ed è usato da Tommaso e Diego.

Indirizzo: https://acceleriamo-os.acceleriamo-os.workers.dev

## Cosa fa (rilascio 1B, Piano A)

- Tre aree nella barra: Commerciale, Automazioni, Economia. Impostazioni si apre dall'avatar.
- Ogni cosa nuova nasce dal "+" nella testata: lead, esito, nota, cliente, proposta, canone, fattura, costo, automazione.
- Commerciale: Oggi con il blocco Adesso e il Foglio Esito, Scaletta, scheda lead, Call, Proposte, Numeri, Clienti.
- Regole sulle fasi: propongono la prossima azione, le persone salvano. Le sequenze partono spente.
- Lead da tre porte: webhook Meta, Foglio Andrea (lettura automatica ogni 15 minuti, spenta finché non si accende), inserimento a mano.
- Email di conferma con Resend al lead nuovo arrivato da Meta o dal foglio.
- Proposte registrate da sole dal wiki (script `dopo-il-pdf`) o a mano.
- Economia leggera: cruscotto del ricorrente, canoni, fatture con il ritardo calcolato, costi. I clienti fuori perimetro non ci entrano.
- Automazioni leggere: pannello con l'interruttore anonimo, in costruzione, scheda.

Avvisi, push, Telegram, Claude, Numeri completi, Lunedì e Diario arrivano con il Piano B.

## Come funziona (in breve)

Tutto gira su Cloudflare, piano gratuito: un Worker (il codice del server, cartella `worker/`) e un database D1 chiamato `acceleriamo-os` (Europa occidentale). L'interfaccia è in React (cartella `src/`), con il design system in `src/ds/`. Lo stato di ogni collegamento si vede in Impostazioni > Integrazioni.

### Il controllo automatico (cron)

Un solo Cron Trigger gira ogni 5 minuti (`wrangler.jsonc`, `*/5 * * * *`) e decide sull'ora di Roma cosa fare (`worker/cron.ts`). Fa **un solo lavoro pesante per giro, a rotazione**:

- primo blocco di 5 minuti: Foglio Andrea (al massimo 2 lead nuovi per giro);
- secondo blocco: email di conferma da mandare o ritentare (al massimo 5 per giro);
- terzo blocco: lead Meta rimasti incompleti (al massimo 3 per giro).

Così ogni lavoro torna ogni 15 minuti. Alle 6:00 di Roma il giro del foglio lascia il posto alle proposte scadute (al massimo 20 per volta, le altre il giorno dopo); il foglio riprende alle 6:15.

Il motivo della rotazione e dei tetti: sul piano gratuito una invocazione del Worker può fare al massimo 50 query D1 (e restiamo sotto le 15 sottorichieste esterne per giro). Un lead nuovo dal foglio costa circa 17 query con tutta la sua catena, uno da Meta circa 13: due lavori insieme sforerebbero. I numeri sono misurati in `tests/cron.test.ts`; se si cambiano i tetti (`LIMITI` in `worker/cron.ts`) va rifatta la misura. Un lavoro che fallisce non ferma gli altri e il giro diventa rosso in Impostazioni.

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

`tests/passaggio.test.ts` è la rete di sicurezza del rilascio: ogni rotta dell'API risponde 401 senza sessione, l'aggancio delle proposte risponde 401 senza la chiave giusta, sequenze e foglio partono spenti, le sette regole di partenza ci sono.

## Mettere online

Servono due variabili d'ambiente con le credenziali Cloudflare (chiave API e identificativo dell'account), da esportare nel terminale prima dei comandi `wrangler`:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run db:migrate:remote   # solo se ci sono migrazioni nuove, e sempre dopo una copia del database
npm run deploy
```

La chiave non sta nel repo e non va mai scritta in un file del progetto.

## Segreti

I segreti stanno solo in Cloudflare, mai nel repo. Si impostano uno alla volta con `npx wrangler secret put <NOME>` e il valore si digita quando il comando lo chiede. In locale eventuali valori di prova vanno in `.dev.vars`, che è escluso da git; nei test ci sono solo valori finti dentro `vitest.config.ts`.

- `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_TOKEN`: connessione con Meta (dal rilascio 1A).
- `RESEND_API_KEY`: invio delle email (conferma al lead nuovo, invito alla call).
- `PROPOSAL_HOOK_KEY`: chiave dell'aggancio delle proposte (`POST /api/hooks/proposals`). La stessa chiave sta nel Portachiavi del Mac, voce `acceleriamo-os-aggancio`, da cui la legge lo script `dopo-il-pdf` del wiki.
- `ANTHROPIC_API_KEY`: chiave di Claude (`npx wrangler secret put ANTHROPIC_API_KEY`). Senza, i lavori di Claude restano in coda e Impostazioni > Integrazioni dice "Non collegato: manca la chiave di Anthropic". Il tetto è di 20 euro al mese (mese di Roma): oltre, i lavori si fermano fino al primo del mese.
- `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (facoltativi): account di servizio Google, via alternativa per leggere il Foglio Andrea. Si usano solo se ci sono tutti e due.

Quando un segreto manca nessuno vede errori: Impostazioni > Integrazioni mostra il servizio in grigio come "Non collegato" (per esempio "Non collegato: manca la chiave di Resend") e il resto dell'app funziona. Senza `RESEND_API_KEY` le email di conferma restano in coda senza consumare tentativi e partono al primo giro dopo l'arrivo della chiave (vedi la regola delle 48 ore sotto); le call si salvano lo stesso, senza invito. Senza `PROPOSAL_HOOK_KEY` l'aggancio risponde sempre 401. Impostazioni > Integrazioni mostra solo se un segreto c'è o manca, mai il valore.

## Foglio Andrea

Il foglio Google dove Andrea scrive i contatti diventa una porta dei lead, in sola lettura e a senso unico (solo le righe nuove).

- **Collegarlo:** in Impostazioni > Integrazioni, Foglio Andrea, si apre il foglio sulla scheda giusta, si copia **l'indirizzo intero** dalla barra del browser e si incolla in "Link della scheda". L'id del foglio e il `gid` della scheda si ricavano dal link (il `gid` è il numero dopo `gid=`; "0" è la prima scheda creata).
- **Via principale, senza credenziali:** il foglio si condivide come "chiunque abbia il link può visualizzare". Il Worker legge l'export CSV della scheda (`export?format=csv&gid=<gid>`), che lascia i valori come sono scritti. Se il foglio non è condiviso così, lo stato dice "Il foglio non è condiviso con chiunque abbia il link"; se il `gid` è sbagliato, "Scheda non trovata".
- **Via alternativa, account di servizio:** se il link pubblico non è accettabile, si crea un account di servizio Google, si mettono `GOOGLE_SA_EMAIL` e `GOOGLE_SA_PRIVATE_KEY`, si condivide il foglio in sola lettura con l'email dell'account e si scrive anche il "Nome della scheda" (quello sulla linguetta in basso). Il file JSON dell'account non entra mai nel repo né nel wiki.
- **Colonna del telefono:** conviene impostarla come "Testo normale" (Formato, Numero, Testo normale) nel foglio, così Google non toglie il "+" o lo zero iniziale dei numeri.
- **Accendere la lettura:** prima "Anteprima" sulle prime righe vere (azienda, referente, telefono ed email al posto giusto, nessuna "Colonna non trovata"; se una colonna non torna si corregge la mappa), poi si accende la lettura automatica e si salva.
- **Arretrato:** il giro automatico crea al massimo 2 lead ogni 15 minuti. Per smaltire un arretrato si usa "Leggi adesso", che continua a leggere finché arriva in fondo al foglio. I lead già arrivati da Meta risultano già presenti, non doppioni.

## Email di conferma

Al lead nuovo che arriva da Meta o dal Foglio Andrea (non a quelli inseriti a mano) parte subito un'email di conferma con Resend, una sola per lead (non ai doppioni di un lead già confermato), dal mittente `Tommaso di Acceleriamo <tommaso@mail.acceleriamo.it>` con risposta a `tommaso@acceleriamo.it` (si cambiano in Impostazioni). Il dominio `mail.acceleriamo.it` deve essere verificato su Resend prima di mettere la chiave.

- **Piede legale:** "Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505", seguito dal link all'informativa privacy. È già il valore di partenza nel codice (`worker/impostazioni/default.ts`) e si può cambiare in Impostazioni.
- **Tentativi:** al massimo 4: il primo invio, alla creazione del lead, più tre ritentativi dal giro automatico. Un indirizzo rifiutato da Resend non si ritenta. Dopo l'ultimo tentativo la scheda del lead dice che l'email non è partita.
- **Regola delle 48 ore:** quando Resend viene collegato, le richieste arrivate più di 48 ore prima non ricevono la conferma (un'email di benvenuto dopo giorni sembra strana): vengono segnate "Non mandata: richiesta arrivata più di 48 ore prima del collegamento di Resend", senza ritentativi.
- Con la conferma spenta in Impostazioni, i lead già in coda restano in coda e ripartono quando la si riaccende (sempre con il limite delle 48 ore).

## Proposte dal wiki: lo script `dopo-il-pdf`

Nel wiki, quando si rende il PDF di un preventivo di Acceleriamo (`_system/scripts/render-pdf.sh`), parte da solo lo script `companies/acceleriamo/automazioni/dopo-il-pdf`, che registra la proposta nel gestionale chiamando `POST /api/hooks/proposals`.

Il frontmatter del preventivo deve avere almeno:

```yaml
type: quotation
numero: ACC-2026-001       # senza numero la proposta non si registra
lead: <id del lead>        # facoltativo: copiato dalla scheda del lead; senza, si abbina per nome o resta "da abbinare"
status: sent               # sent, signed o paid: la proposta è inviata; altrimenti è una bozza
```

E, se si sanno, questi campi che lo script legge e manda: `azienda`, `opzione` (`standard` o `proprieta`), `setup` e `canone` (euro, numeri senza simbolo, per esempio `2000` e `150`), `ore`, `alternativa_proprieta` (euro), `validita` (data `2026-11-08`, fine giornata di Roma; senza, vale l'invio più i giorni di validità di Impostazioni), `link_pdf` (solo `https://`). Il template dei preventivi del wiki oggi non ha ancora questi campi: vanno aggiunti a mano o nel template.

- **Chiave:** lo script la legge dal Portachiavi del Mac, voce `acceleriamo-os-aggancio`; è la stessa di `PROPOSAL_HOOK_KEY` su Cloudflare. Senza chiave non chiama e lo dice; il PDF è fatto comunque.
- **Prova senza chiamare:** `dopo-il-pdf <file.md> <file.pdf> --prova` stampa il corpo che manderebbe.
- **Indirizzo:** di default il Worker online; si cambia con la variabile `ACC_OS_URL`.
- **Limiti dell'aggancio:** chiave `Authorization: Bearer <chiave>` (senza, 401 e nessuna scrittura), corpo al massimo 16 KB (413), al massimo 30 chiamate l'ora (429). Ogni chiamata con la chiave giusta finisce nel registro di Impostazioni > Integrazioni, Aggancio, che tiene 30 giorni.

## Spazio demo

Una copia dell'app con dati finti, da mostrare a clienti e collaboratori senza aprire i dati veri. È un secondo Worker (`acceleriamo-os-demo`) con il suo database D1 (`acceleriamo-os-demo`): stesso codice, ambiente `demo` in `wrangler.jsonc`, nessun cron e nessun segreto. In testa a ogni pagina compare "Spazio demo, dati finti"; in Impostazioni > Integrazioni ogni servizio dice "Spazio demo"; il Foglio Andrea non si legge. Push, Telegram, email e Claude non partono mai, perché nella demo le chiavi non esistono.

I dati (40 lead in sei settori, call, proposte, schede azienda, analisi del coach, tre clienti con automazioni, canoni e fatture) stanno in `scripts/demo-dati.ts`. Email solo su `esempio.it`, telefoni con prefisso `+39 000`: nessun messaggio può arrivare a una persona vera. L'unico utente è `demo`, con la password scelta al ripristino.

Prima volta (con le credenziali Cloudflare esportate come sopra):

```bash
npx wrangler d1 create acceleriamo-os-demo   # copia l'id stampato in wrangler.jsonc, ambiente demo, al posto degli zeri
npm run db:migrate:demo                      # crea le tabelle nel database della demo
npm run demo:reset                           # semina i dati finti, chiede la password dell'utente demo
npm run deploy:demo                          # pubblica su https://acceleriamo-os-demo.acceleriamo-os.workers.dev
```

Ripristino (rimette i dati di partenza e cancella tutto quello che è stato cambiato): `npm run demo:reset`. In locale: `npm run db:migrate:demo:locale` una volta, poi `npm run demo:locale`.

## Aggiungere un utente

Come in locale, ma per il database online si usa `--remote` al posto di `--local` nel comando che lo script stampa:

```bash
npx tsx scripts/create-user.ts <utente> "<Nome>"
```

Poi lancia il comando stampato (con `--remote`) e cancella il file `create-user-<utente>.local.sql`.

## Cartelle

- `worker/`: server (accesso, lead, regole, call, proposte, foglio, email, economia, automazioni, controllo automatico)
- `src/`: interfaccia (design system in `src/ds/`, pagine in `src/pagine/`)
- `drizzle/`: migrazioni del database
- `scripts/`: creazione utenti e passaggio dati dal vecchio prototipo
- `tests/`: test automatici

## Passaggio alla 1B (fatto una volta)

Tocca dati veri: si fa solo quando Tommaso dice di procedere, con le credenziali Cloudflare esportate nel terminale (mai in un file). Nessun segreto vero va scritto qui o in un file del progetto: solo i nomi. Niente `git push` finché non lo dice lui.

1. **Copia del database, prima di tutto.**
   `npx wrangler d1 export acceleriamo-os --remote --output backup-1a.local.sql`
   I file `*.local.sql` sono esclusi da git.
2. **Conteggi prima:**
   `npx wrangler d1 execute acceleriamo-os --remote --command "SELECT (SELECT count(*) FROM leads) lead, (SELECT count(*) FROM leads WHERE appointment_at IS NOT NULL) appuntamenti, (SELECT count(*) FROM leads WHERE proposal_url IS NOT NULL) preventivi, (SELECT count(*) FROM activities) attivita"`
3. **Migrazioni:** `npm run db:migrate:remote`.
4. **Conteggi dopo:**
   `npx wrangler d1 execute acceleriamo-os --remote --command "SELECT (SELECT count(*) FROM leads) lead, (SELECT count(*) FROM calls) call, (SELECT count(*) FROM proposals WHERE registered_via = 'migrazione') proposte, (SELECT count(*) FROM activities) attivita, (SELECT count(*) FROM stage_rules) regole"`
   Devono tornare: `lead` e `attivita` uguali a prima, `call` uguale ad `appuntamenti`, `proposte` (quelle "1A-") uguale a `preventivi`, `regole` = 7. Se un numero non torna ci si ferma: `backup-1a.local.sql` rimette tutto com'era su un database vuoto (`npx wrangler d1 execute acceleriamo-os --remote --file backup-1a.local.sql`) e si guarda la migrazione prima di riprovare.
5. **Piede dell'email di conferma:** il valore di partenza è già quello vero (vedi "Email di conferma"); se Tommaso vuole un testo diverso, lo si cambia in Impostazioni **prima** di mettere la chiave di Resend, così nessuna email parte con il piede sbagliato.
6. **Segreti nuovi, uno alla volta** (`npx wrangler secret put <NOME>`): `RESEND_API_KEY` (dopo la verifica del dominio su Resend), `PROPOSAL_HOOK_KEY` (generata a caso, per esempio con `openssl rand -hex 32`, e salvata anche nel Portachiavi alla voce `acceleriamo-os-aggancio` con `security add-generic-password -a acceleriamo-os -s acceleriamo-os-aggancio -w <chiave> -U`), e solo se serve la via alternativa `GOOGLE_SA_EMAIL` e `GOOGLE_SA_PRIVATE_KEY`. Poi `npx wrangler secret list` mostra solo i nomi: i tre di Meta più quelli nuovi.
7. **Rilascio:** `npm test && npm run typecheck && npm run deploy`. Le sequenze restano spente.
8. **Collaudo:** dal telefono, login, barra con Commerciale, Automazioni, Economia, "+" nella testata; in Impostazioni > Integrazioni il giro programmato diventa verde entro 5 minuti. Poi Foglio Andrea come sopra (link, Anteprima, accensione, "Leggi adesso"); Fasi e regole controllate da Tommaso e salvate, e solo dopo si accendono le sequenze. Infine le tre prove con dati veri: un lead dallo strumento di test di Meta (arriva in Oggi entro pochi secondi con la conferma già partita), una riga di prova nel foglio (un lead solo, anche dopo due giri), un preventivo di prova dal wiki con `lead:` copiato dalla scheda (la proposta compare nella scheda e in Proposte, il registro dell'aggancio mostra 201). I dati di prova poi vanno nel cestino.
