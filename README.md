# Acceleriamo OS

Il gestionale interno di Acceleriamo: raccoglie i lead (da Meta, dal Foglio Andrea o inseriti a mano), li accompagna fino alla chiusura e tiene i conti leggeri del ricorrente. È online ed è usato da Tommaso e Diego.

Indirizzo: https://acceleriamo-os.acceleriamo-os.workers.dev

## Cosa fa (rilascio 1B)

- Tre aree nella barra: Commerciale, Automazioni, Economia. Impostazioni si apre dall'avatar.
- Ogni cosa nuova nasce dal "+" nella testata: lead, esito, nota, cliente, proposta, canone, fattura, costo, automazione.
- Commerciale: Oggi con il blocco Adesso e il Foglio Esito, Scaletta, scheda lead, Call, Proposte, Numeri, Clienti.
- Regole sulle fasi: propongono la prossima azione, le persone salvano. Le sequenze partono spente.
- Lead da tre porte: webhook Meta, Foglio Andrea (lettura automatica ogni 15 minuti, spenta finché non si accende), inserimento a mano.
- Email di conferma con Resend al lead nuovo arrivato da Meta o dal foglio.
- Proposte registrate da sole dal wiki (script `dopo-il-pdf`) o a mano.
- Economia leggera: cruscotto del ricorrente, canoni, fatture con il ritardo calcolato, costi. I clienti fuori perimetro non ci entrano.
- Automazioni leggere: pannello con l'interruttore anonimo, in costruzione, scheda.

Con il Piano B si aggiunge:

**Avvisi e push.** La voce "Avvisi" raccoglie lead nuovo, SLA in scadenza o scaduto, Meta senza lead da 48 ore, Claude al tetto. Un avviso nasce una volta per persona e si chiude da solo quando la cosa è fatta (per esempio il lead viene chiamato). L'app si installa sul telefono (Safari, Condividi, "Aggiungi a Home") e manda le notifiche push, con le ore di silenzio scelte da ognuno.

**Telegram.** Un bot manda solo tre messaggi: "Lead nuovo", "SLA scaduto", "Claude al tetto". Ognuno collega la sua chat da Utenti e profilo.

**Claude.** Classifica da solo i lead nuovi del foglio e di Meta, prepara la scheda azienda (con ricerca sul web), fa da coach dopo una call e scrive il commento del lunedì. Spesa massima 20 euro al mese: oltre, i lavori si fermano fino al primo del mese.

**Numeri.** Tre segmenti: Funnel, Campagne (con la spesa pubblicitaria scritta a mano ogni mese), Previsione.

**Lunedì e Diario.** Ogni lunedì alle 7 l'app prepara la revisione della settimana chiusa, con il commento di Claude. Il Diario è la cronologia di quello che è successo.

**Impostazioni.** Profilo con dispositivi push e Telegram, utenti, integrazioni con un dettaglio per ognuna, stato dei giri, dati (esporta e importa CSV, registro, cestino) e la ricerca dalla testata.

**Spazio demo.** Una copia con dati finti da mostrare, su un indirizzo separato (sezione "Spazio demo").

## Come funziona (in breve)

Tutto gira su Cloudflare, piano gratuito: un Worker (il codice del server, cartella `worker/`) e un database D1 chiamato `acceleriamo-os` (Europa occidentale). L'interfaccia è in React (cartella `src/`), con il design system in `src/ds/`. Lo stato di ogni collegamento si vede in Impostazioni > Integrazioni.

### Il controllo automatico (cron)

Un solo Cron Trigger gira ogni 5 minuti (`wrangler.jsonc`, `*/5 * * * *`) e decide sull'ora di Roma cosa fare (`worker/cron.ts`). Dal Piano B ogni giro fa più lavori, in ordine di priorità, finché c'è budget:

1. proposte scadute (solo alle 6:00, da sole);
2. Foglio Andrea (al massimo 2 lead nuovi; 1 se nel giro c'è altro, cioè quasi sempre: in pratica 12 lead l'ora);
3. recupero dei lead Meta (ogni 15 minuti, vedi "Meta lead");
4. lead Meta rimasti incompleti (ogni 15 minuti, al massimo 2);
5. avvisi in app;
6. push (al massimo 10);
7. Telegram (al massimo 5 messaggi);
8. email di conferma e inviti alle call (al massimo 7);
9. controllo "Meta senza lead da 48 ore" (una volta l'ora);
10. task ricorrenti dei lavori (alle 7:00 e alle 7:30, al massimo 12 task);
11. revisione del lunedì (lunedì dalle 7:00 alle 7:55);
12. controllo dello stato delle automazioni (ogni 15 minuti, vedi "Stato");
13. Claude, sempre per ultimo (al massimo 3 lavori).

Ogni giro scrive l'esito di ogni lavoro (fatto, saltato per il budget, spento, errore) nello storico della pagina Stato, con una sola query.

Il motivo dei tetti: sul piano gratuito una invocazione del Worker può fare al massimo 50 query D1 e 50 sottorichieste esterne. Il giro si tiene a 45 query e 15 sottorichieste. Ogni lavoro dichiara in `LAVORI` quanto costa (query fisse, query per unità, sottorichieste per unità) e prende solo le unità che il budget gli lascia; quello che non entra passa al giro dopo, senza errori. Foglio, Meta e avvisi lasciano sempre spazio ad almeno 2 push per giro. I costi sono misurati in `tests/cron.test.ts`: se si cambia un `max` va rifatta la misura. Un lavoro che fallisce non ferma gli altri e il giro diventa rosso in Impostazioni.

Task ricorrenti dei lavori: alle 7:00 e alle 7:30 di Roma il giro crea, per ogni lavoro attivo, la task del mese se oggi è il giorno indicato o dopo (una sola per mese, indice unico su lavoro, modello e mese). Costano 2 query fisse più una a task, al massimo 12 per giro; quelle che non entrano passano alla seconda passata delle 7:30 o al giorno dopo.

Limiti noti, accettati:

- Il giro può arrivare a 45 query esatte.
- Con un arretrato nel foglio le conferme e il lavoro Meta del cron possono saltare un giro. I lead Meta entrano comunque dal webhook in pochi secondi: il cron ritenta solo quelli incompleti.
- Con molti avvisi in un giro le conferme slittano al giro dopo.
- Con un arretrato le push dello SLA possono ritardare fino a 30 minuti.
- Claude non avvia lavori nuovi dopo 9 minuti dall'inizio del giro; ogni chiamata ha una scadenza di 240 secondi.

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
npm run e2e       # controlli con Playwright sullo spazio demo in locale (schermate e flussi)
npm run e2e:foto  # rifà le foto di confronto: guardarle prima del commit
```

`tests/passaggio.test.ts` è la rete di sicurezza del rilascio: ogni rotta dell'API risponde 401 senza sessione, l'aggancio delle proposte risponde 401 senza la chiave giusta, sequenze e foglio partono spenti, le sette regole di partenza ci sono.

`npm run e2e` gira sullo spazio demo locale con un'ora fissa, così le foto non cambiano da un giorno all'altro. Le foto approvate stanno nel repo: se una schermata cambia il controllo fallisce. Se il cambio è voluto si lancia `npm run e2e:foto`, si guardano le foto nuove una per una e solo dopo si committano.

## Mettere online

### Interfaccia su Vercel

Ogni push sul branch di produzione `acceleriamo-os` avvia la build Vercel: `npm ci`, `npm run build`, pubblicazione di `dist/client`.
Le pagine del gestionale e i file statici vengono serviti dalla nuova build. Le API, le pagine pubbliche `/r/*`, `robots.txt` e `sitemap.xml` vengono inoltrate al Worker Cloudflare.
Il ripiego `/assets/*` recupera dal Worker i file delle pagine pubbliche quando non sono nella build Vercel; i file presenti in `dist/client` hanno precedenza sulle riscritture.
Non configurare Vercel come semplice proxy di tutto il sito: il deploy risulterebbe riuscito ma l'interfaccia resterebbe quella pubblicata sul Worker.

### Backend su Cloudflare

Servono due variabili d'ambiente con le credenziali Cloudflare (chiave API e identificativo dell'account), da esportare nel terminale prima dei comandi `wrangler`:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
```

La chiave non sta nel repo e non va mai scritta in un file del progetto.

Prima di pubblicare: `npm test && npm run typecheck && npm run build && npm run e2e` tutti verdi.

L'ordine è sempre lo stesso: **copia del database, controllo dei doppioni, migrazioni, pubblicazione**.

1. **Copia del database**, prima di ogni migrazione:

   ```bash
   npx wrangler d1 export acceleriamo-os --remote --output backup-$(date +%Y-%m-%d).local.sql
   ls -l backup-*.local.sql
   ```

   Il file deve essere non vuoto. Resta sul computer (i file `*.local.sql` sono esclusi da git) e il backup notturno lo copia nel Drive. In caso di guai si rimette su un database vuoto con `npx wrangler d1 execute acceleriamo-os --remote --file <copia>`.

2. **Controllo dei doppioni**, solo la prima volta che si applica la migrazione `0012` (vincolo unico di un cliente per lead):

   ```bash
   npx wrangler d1 execute acceleriamo-os --remote --command "SELECT origin_lead_id, count(*) FROM clients WHERE origin_lead_id IS NOT NULL AND deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1"
   ```

   Deve tornare vuoto. Se torna righe, la `0012` fallirebbe: prima si mette nel cestino il cliente doppione (dall'app), poi si rilancia il controllo.

3. **Migrazioni** (con il Piano B sono la `0009`, la `0010` con l'indice di Telegram, la `0011` e la `0012`; la `0007` e la `0008` dei lavori sono già applicate):

   ```bash
   npm run db:migrate:remote
   ```

4. **Pubblicazione:**

   ```bash
   npm run deploy
   curl -s https://acceleriamo-os.acceleriamo-os.workers.dev/api/health   # deve rispondere {"ok":true}
   ```

Dopo `npm run deploy:demo` la cartella `dist` contiene la build della demo: `npm run deploy` la rifà da solo, quindi la produzione esce giusta.

## Segreti

I segreti stanno solo in Cloudflare, mai nel repo. Si impostano uno alla volta con `npx wrangler secret put <NOME>` e il valore si digita quando il comando lo chiede (non passa dalla chat né da un file). In locale eventuali valori di prova vanno in `.dev.vars`, che è escluso da git; nei test ci sono solo valori finti dentro `vitest.config.ts`.

- `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_TOKEN`: connessione con Meta (dal rilascio 1A).
- `RESEND_API_KEY`: invio delle email (conferma al lead nuovo, invito alla call).
- `PROPOSAL_HOOK_KEY`: chiave dell'aggancio delle proposte (`POST /api/hooks/proposals`). La stessa chiave sta nel Portachiavi del Mac, voce `acceleriamo-os-aggancio`, da cui la legge lo script `dopo-il-pdf` del wiki.
- `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (facoltativi): account di servizio Google, via alternativa per leggere il Foglio Andrea. Si usano solo se ci sono tutti e due.

Dal Piano B, tre segreti nuovi:

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # chiave del workspace Acceleriamo su console.anthropic.com
npx wrangler secret put VAPID_PRIVATE_KEY   # la "Private Key" stampata da npx web-push generate-vapid-keys
npx wrangler secret put TELEGRAM_BOT_TOKEN  # il token che BotFather dà alla creazione del bot
```

Le chiavi VAPID si generano una volta con `npx web-push generate-vapid-keys` (nessuna installazione: `npx` lo scarica al volo). La privata va solo in `wrangler secret put`.

Le variabili pubbliche stanno in `wrangler.jsonc`, sotto `vars`, e si committano:

| Variabile | Cosa contiene |
|---|---|
| `VAPID_PUBLIC_KEY` | la "Public Key" della stessa coppia VAPID |
| `VAPID_SOGGETTO` | contatto richiesto da VAPID: l'indirizzo dell'app (o un `mailto:`) |
| `APP_URL` | l'indirizzo dell'app, usato nei link di push e Telegram |
| `TELEGRAM_BOT` | il nome utente del bot, senza @ |
| `DEMO_URL` | l'indirizzo dello spazio demo, mostrato in Impostazioni > Dati |

**La coppia VAPID non si cambia più.** Se cambia, ogni telefono e computer va riattivato a mano da "Attiva le notifiche".

`SPAZIO` esiste solo nell'ambiente `demo`. Nelle `vars` di produzione non deve mai comparire: spegnerebbe in silenzio tutti gli invii.

Quando un segreto manca nessuno vede errori: Impostazioni > Integrazioni mostra il servizio in grigio come "Non collegato" (per esempio "Non collegato: manca la chiave di Resend") e il resto dell'app funziona. Senza `RESEND_API_KEY` le email di conferma restano in coda senza consumare tentativi e partono al primo giro dopo l'arrivo della chiave (vedi la regola delle 48 ore sotto); le call si salvano lo stesso, senza invito. Senza `PROPOSAL_HOOK_KEY` l'aggancio risponde sempre 401. Senza le chiavi VAPID non parte nessuna push; senza `TELEGRAM_BOT_TOKEN` nessun messaggio Telegram; gli avvisi restano comunque nell'app. Impostazioni > Integrazioni mostra solo se un segreto c'è o manca, mai il valore.

## Risponditore

Risponde ai commenti Instagram che contengono la parola di una campagna (per esempio TEMPO) con una risposta pubblica, manda in privato un messaggio con un pulsante e, al tocco, il link alla pagina della risorsa (`/r/<slug>`). Chi commenta non entra mai nei lead. Si gestisce da Automazioni > Risponditore. Nello spazio demo il webhook risponde 200 senza fare nulla e il cron non gira.

### Segreti da impostare

Uno alla volta, con `npx wrangler secret put <NOME>` (il valore si digita quando lo chiede):

- `IG_APP_SECRET`: il segreto dell'app Instagram su Meta, con cui si controlla la firma dei webhook (se non c'è si prova `META_APP_SECRET`).
- `IG_VERIFY_TOKEN`: una stringa lunga e casuale che scegli tu; la stessa va scritta su Meta quando configuri il webhook.
- `IG_TOKEN_KEY`: 32 byte casuali in base64 (per esempio `openssl rand -base64 32`). Cifra il token Instagram dentro il database. Se la perdi o la cambi il token salvato non si legge più e va ricaricato.

La versione dell'API, `IG_GRAPH_VERSION` (`v25.0`), non è un segreto: sta in `wrangler.jsonc`. Senza i segreti la sezione resta in grigio in Impostazioni > Integrazioni e nulla si rompe.

### Webhook su Meta

Nella configurazione dell'app Instagram imposta:

- URL di callback: `https://risorse.acceleriamo.it/api/webhooks/instagram`
- Token di verifica: lo stesso valore di `IG_VERIFY_TOKEN`
- Campi da sottoscrivere: `comments` e `messages`

### Caricare il token

Prendi il token dell'account Instagram da Meta (accesso Instagram a lunga durata, 60 giorni) e caricalo in uno di questi due modi:

- dalla pagina Automazioni > Risponditore, con "Collega l'account" o "Cambia il token";
- con `POST /api/risponditore/account` e corpo `{ "token": "..." }`, da sessione aperta.

L'app chiede a Instagram chi è il token, lo salva cifrato e mostra il nome dell'account e la scadenza. Il token non viene mai mostrato né scritto nei log. Il rinnovo parte da solo e, se non riesce, sette giorni prima della scadenza arriva un avviso.

### Risorse e campagne da file: lo script di semina

Le risorse (pagine `/r/<slug>`) e le campagne dei reel pianificati si caricano da un file JSON. Parti da `scripts/risponditore-semina.esempio.json` (due voci di prova, TEMPO e MANUTENZIONE, con testi finti da sostituire):

```bash
npm run risponditore:semina -- mio-file.json            # database locale
npm run risponditore:semina -- mio-file.json --remote   # database online
```

Lo script controlla il file (slug in minuscolo con i trattini, `pdfUrl` solo http o https, parola unica dopo la normalizzazione, almeno una risposta pubblica, pulsante di massimo 20 caratteri) e si ferma con l'elenco degli errori. Si può rilanciare: una risorsa con lo stesso slug o una campagna con la stessa parola (e lo stesso post) viene aggiornata, mai duplicata. Senza `--remote` non tocca il database online.

### Anteprima della risorsa (messaggio e link nelle chat)

Quando la persona tocca il pulsante riceve due cose: una riga di testo (`testoLink` della campagna, scritta come da una persona) e una scheda sola con l'anteprima della risorsa, il titolo, "N passaggi, si legge in M minuti" e il pulsante per aprirla. Ai tocchi successivi arriva solo la scheda. La stessa immagine è l'anteprima del link quando la pagina `/r/<slug>` viene incollata in una chat: il Worker aggiunge all'HTML titolo, descrizione e immagine (`worker/risorse/pagina.ts`, `"/r/*"` in `run_worker_first`).

Le anteprime si generano dallo stesso file JSON della semina, con Google Chrome installato:

```bash
npm run risorse:grafiche -- mio-file.json                     # tutte le risorse
npm run risorse:grafiche -- mio-file.json --solo slug1,slug2  # solo alcune
```

Lo script scrive `public/risorse/<slug>/anteprima.png` (1200x630) e `worker/risponditore/grafiche-risorse.ts`, poi si fa commit e deploy. Il Worker usa l'anteprima solo se titolo e passi della risorsa nel database sono ancora quelli da cui è stata disegnata: se li cambi, rigenera; fino ad allora parte l'immagine generica del brand.

**Motori di ricerca.** Le pagine `/r/<slug>` delle risorse attive si possono indicizzare (il resto dell'app resta `noindex`). Se nel file di semina la risorsa ha la chiave `seo` (`title`, `description`, `jsonld`), il Worker usa quel titolo e quella descrizione e mette i dati strutturati nella pagina, con l'anteprima come immagine. `/robots.txt` apre `/r/` e chiude `/api/`; `/sitemap.xml` elenca le risorse attive. La colonna `seo` arriva con la migrazione `0017_risorse_seo.sql`: va applicata prima di seminare il file nuovo.

### Prove dal vivo

Dopo il deploy, con il token caricato, fai queste prove e scrivi l'esito nel registro del progetto:

1. Commento con la parola da un profilo esterno: arriva la risposta pubblica e il messaggio privato col pulsante.
2. Commento senza la parola: non succede nulla (evento ignorato).
3. Commento dell'account stesso con la parola: ignorato, niente risposta.
4. Lo stesso commento due volte: una sola risposta (nessun doppione).
5. Tocco del pulsante nel messaggio privato: arriva il link.
6. Apertura del link: la pagina `/r/<slug>` si vede e il PDF si apre.
7. Rinnovo del token a mano: ricarica un token valido come sopra e controlla che la scadenza si sposti avanti di 60 giorni.

## Claude

Claude fa quattro lavori, tutti in una coda (`ai_jobs`) che il giro del cron smaltisce per ultima, al massimo 3 per giro:

- classificazione del lead nuovo (Haiku);
- scheda azienda, con ricerca sul web (Sonnet 5.5);
- coach dopo una call (Sonnet 5.5);
- commento della revisione del lunedì (Haiku).

**Senza `ANTHROPIC_API_KEY`** l'app funziona lo stesso: in Impostazioni > Integrazioni la voce Claude dice "Non collegato: manca la chiave di Anthropic", i lavori restano in coda e nessuno vede errori. Partono quando arriva la chiave.

**Lead non classificati dopo 2 giorni.** La classificazione parte da sola solo per i lead del foglio e di Meta entrati negli ultimi 2 giorni. Se Claude resta spento (o senza chiave) per più di 2 giorni, i lead più vecchi non si classificano più da soli: si apre il lead e si preme "Prepara la scheda". I lead scritti a mano non si classificano mai da soli.

**Il coach si trova solo nella scheda del lead**, nella sezione della call. La sezione Call non lo offre.

**Tetto di spesa: 20 euro al mese.** Il server conta lo speso in micro-dollari (1 centesimo = 10.000) e conta i dollari come euro, per prudenza. Il mese è quello di Roma. Prima di ogni lavoro il server prenota il costo massimo possibile: se `speso + costo massimo` supera il tetto il lavoro resta "fermo per il tetto" e l'avviso "Claude al tetto" arriva una volta sola nel mese (in app, push e Telegram). Un lavoro piccolo (Haiku) può passare anche quando uno grande (Sonnet con ricerca) resta fermo. Il primo del mese, ora di Roma, i lavori fermi tornano in coda. Una chiamata interrotta conta il costo massimo, non zero. Da 16 euro spesi compare un punto arancione sull'avatar, come preavviso.

**Rete di sicurezza: 25 dollari sul workspace Anthropic.** Su console.anthropic.com il limite di spesa del workspace Acceleriamo resta a 25 dollari al mese. Se l'app sbagliasse i conti, Anthropic si ferma lì.

Modelli, prezzi e tetto stanno nell'impostazione `claude` del database. Impostazioni non li modifica: si cambiano con un comando, per esempio il tetto (in centesimi):

```bash
npx wrangler d1 execute acceleriamo-os --remote --command "UPDATE settings SET value = json_set(value, '$.tettoCents', 2000) WHERE key = 'claude'"
```

Prezzi di partenza (dollari per milione di token, ingresso e uscita): Haiku 4.5 a 1 e 5, Sonnet 5 e 5.5 a 2 e 10, Opus 5.5 a 4 e 20 (lettura dalla cache 0,2, come da listino). Un modello che non è nel listino si conta al prezzo più alto. Se Anthropic cambia i prezzi si aggiorna il listino con lo stesso tipo di comando (`$.prezzi`). Il valore di partenza è in `worker/impostazioni/default.ts`.

Il registro dei costi (speso del mese, lavori per tipo, lavori fermi) è in Impostazioni > Integrazioni > Claude.

Dati verso Claude: solo quelli del lead (azienda, sito, email ridotta, risposte del modulo, testo LinkedIn; per il coach gli appunti della call e lo storico del lead). Mai clienti, fatture, canoni o costi.

Limite noto della coda, raro e accettato: se un'invocazione muore a metà lavoro, il lavoro resta "in corso" e torna in coda dopo 20 minuti, con un tentativo consumato.

## Meta lead

I lead dei moduli Meta entrano in due modi, con lo stesso registro anti doppioni (un lead Meta si registra una volta sola, per id, anche se poi finisce nel cestino):

- **Webhook** (`/api/webhooks/meta`): Meta avvisa in pochi secondi. App iscritta all'oggetto `page`, campo `leadgen`; la Pagina è iscritta all'app.
- **Recupero ogni 15 minuti** (`worker/meta/recupero.ts`, lavoro `meta_recupero` del giro): rete di sicurezza se il webhook perde qualcosa. Legge l'elenco dei moduli della Pagina (riletto ogni 6 ore) e chiede a Meta, in una sola richiesta batch, i lead creati dopo l'ultimo controllo meno un'ora di margine. I lead di prova di Meta ("test lead") si scartano. Lo stato del recupero sta in `settings`, chiave `meta_recupero`.

Il **primo giro** guarda indietro 90 giorni e va a pagine: al massimo 25 righe per modulo a giro, finché non ha letto tutto. I lead trovati entrano subito nella lista; i dati del modulo li completa il lavoro "lead Meta incompleti", 2 ogni 15 minuti, quindi un arretrato grosso si completa in qualche ora. I lead più vecchi di 48 ore entrano **senza catena**: niente avviso "lead nuovo" e niente email di conferma.

Configurazione:

- variabile `META_PAGE_ID` in `wrangler.jsonc` (l'id della Pagina, non è un segreto);
- segreti `META_PAGE_TOKEN` (token della Pagina, senza scadenza) per il recupero e per completare i lead, `META_APP_SECRET` per la firma del webhook, `META_VERIFY_TOKEN` per la verifica del webhook.

Senza token o senza id della Pagina il recupero è spento (grigio nella pagina Stato) e non chiama Meta.

## Stato

La pagina **Automazioni > Stato** (`/automazioni/stato`) dice in un colpo d'occhio se le automazioni girano. Ogni voce ha un colore:

- **verde**: l'ultimo giro è andato bene;
- **giallo**: non si sente da più del previsto (intervallo più metà dell'intervallo, almeno 5 minuti);
- **rosso**: l'ultimo giro è andato in errore; si vede il messaggio e il passo in cui si è fermata;
- **grigio**: spenta o mai partita.

Le voci sono di tre tipi:

- i lavori del giro, più il giro intero (`giro`): li scrive il cron a ogni giro;
- il webhook dei lead Meta (`meta_webhook`): verde all'ultimo lead ricevuto, rosso dopo una notifica con firma non valida o illeggibile; non ha intervallo, quindi non diventa mai gialla;
- le automazioni esterne (n8n, Make, script dei clienti): si aggiungono con "Segui un'automazione esterna" e mandano un **battito** a ogni giro.

Il battito è una chiamata con la chiave della voce, che si vede una volta sola alla creazione (o quando se ne fa una nuova):

```bash
curl -X POST https://acceleriamo-os.diego-faf.workers.dev/api/stato/battito \
  -H "Authorization: Bearer bat_..." -H "content-type: application/json" \
  -d '{"esito":"ok"}'
# in caso di errore: {"esito":"errore","messaggio":"Timeout del CRM","passo":"Invio al CRM"}
```

Nel database si salva solo l'impronta della chiave (SHA-256). Se la voce è legata a una scheda automazione, la scheda mostra lo stato e mette in evidenza il blocco del flusso in cui si è fermata.

**Avvisi.** Il lavoro `stato` del giro (ogni 15 minuti) apre un avviso "Automazione in errore o ferma" quando una voce diventa rossa o resta gialla oltre il doppio dell'intervallo: uno per episodio, a tutti, anche push e Telegram. L'avviso si chiude da solo quando la voce torna verde. Lo storico dei giri tiene 30 giorni (pulizia alle 3:00).

## Lavori tipo

`npm run lavori:tipo -- --remote` crea o aggiorna i tre lavori tipo "Una tantum", "Mensile" e "Mensile più una tantum" con i loro passi, giorni e assegnatari (`scripts/lib/lavori-tipo.ts`). Gli id sono fissi: rilanciarlo aggiorna, non duplica. Senza `--remote` tocca il database locale.

## Avvisi, push e Telegram

- **Avvisi SLA:** il controllo guarda i 20 lead in attesa più recenti per fase; oltre quelli l'avviso SLA non parte. Un avviso nasce una volta per persona, anche se il giro lo rilegge trenta volte, e si chiude da solo quando il lead viene chiamato.
- **Ore di silenzio:** spengono push e Telegram, non l'avviso in app. La push saltata non viene rimandata.
- **Push non consegnate:** con errori 429 o 5xx si ritenta fino a 6 ore, poi si lascia perdere. Un dispositivo che risponde 410 sparisce da solo.
- **Telegram, collegamento:** da Utenti e profilo, "Collega Telegram", si preme Avvia nel bot. Il codice vale 15 minuti. Con un codice in attesa il collegamento passa prima degli avvisi, che slittano al giro dopo.
- **Telegram, arretrato di 6 ore:** chi si collega riceve in blocco gli avvisi aperti delle ultime 6 ore (al massimo 5 per giro). È voluto.
- **Telegram, codice sbagliato:** il bot risponde "Codice non riconosciuto", ma legge i messaggi solo quando qualcuno ha un codice valido in attesa. Chi scrive un codice a caso senza nessun collegamento aperto riceve la risposta più tardi o mai (Telegram tiene i messaggi 24 ore). Se nello stesso giro si scrive prima un codice sbagliato e poi quello giusto, la chat si collega e può ricevere anche "Codice non riconosciuto": non è un guasto.
- **Telegram, errori:** se una persona blocca il bot (403) la sua chat si scollega. Un token sbagliato o revocato (401 o 404) lascia tutto in coda e la voce Telegram diventa rossa in Integrazioni.

## Numeri, Lunedì e Diario

- **Costo per lead:** i doppioni contano una volta. Il blocco del Funnel ereditato dalla 1A li conta ancora, di proposito.
- **"n.d."** al posto dei numeri quando i lead sono meno di 5.
- **SLA:** esclude i lead inseriti a mano.
- **Tempi per fase:** solo sui lead arrivati nel periodo scelto.
- **Previsione:** solo sulle fasi aperte, con la proposta aperta più recente di ogni lead. Senza setup si usa il valore stimato del lead.
- **Spesa pubblicitaria:** si scrive a mano ogni mese ("Scrivi la spesa del mese"), accetta virgola e punto, massimo 100.000 euro. Con spesa 0 la riga dice "Nessuna spesa"; se manca dice "Spesa da scrivere".
- **Lunedì:** una revisione a settimana, creata dal giro del lunedì alle 7 (ora di Roma). Il commento di Claude è un lavoro a parte e può arrivare un giro dopo.
- **Diario e Registro:** si scorrono a pagine; il segno di pagina è una stringa `at:id`.

## Impostazioni: ricerca, export e import

- **Ricerca** (dalla testata): parte da 2 lettere e cerca con `LIKE '%testo%'` su lead, proposte, automazioni e fatture, cioè 4 query (5 con la sessione) che scorrono le tabelle intere. Oggi i volumi sono di centinaia di righe e va bene. Con 5.000 lead, oltre circa 1.000 richieste al giorno (circa 300 ricerche) ci si avvicina al tetto gratuito di 5 milioni di righe lette al giorno; con 25.000 lead bastano circa 200 richieste. Il rimedio, quando servirà: indice FTS5 oppure minimo 3 lettere. Vale anche per il conteggio del cestino.
- **Esporta CSV:** legge l'intera tabella in una query e costruisce il file in memoria, senza tetto di righe. Nessun segreto né hash nelle colonne. Oggi va bene; con tabelle molto grandi andrà diviso.
- **Importa CSV:** con anteprima, a blocchi di 20 righe per richiesta. I lead importati non ricevono l'email di conferma.
- **Doppioni per azienda:** il confronto abbassa a mano solo le vocali accentate italiane: Ç, Ñ, Ü non vengono unificate. Un cliente nel cestino non blocca la creazione di un cliente nuovo dallo stesso lead.

## Foglio Andrea

Il foglio Google dove Andrea scrive i contatti diventa una porta dei lead, in sola lettura e a senso unico (solo le righe nuove).

- **Collegarlo:** in Impostazioni > Integrazioni, Foglio Andrea, si apre il foglio sulla scheda giusta, si copia **l'indirizzo intero** dalla barra del browser e si incolla in "Link della scheda". L'id del foglio e il `gid` della scheda si ricavano dal link (il `gid` è il numero dopo `gid=`; "0" è la prima scheda creata).
- **Via principale, senza credenziali:** il foglio si condivide come "chiunque abbia il link può visualizzare". Il Worker legge l'export CSV della scheda (`export?format=csv&gid=<gid>`), che lascia i valori come sono scritti. Se il foglio non è condiviso così, lo stato dice "Il foglio non è condiviso con chiunque abbia il link"; se il `gid` è sbagliato, "Scheda non trovata".
- **Via alternativa, account di servizio:** se il link pubblico non è accettabile, si crea un account di servizio Google, si mettono `GOOGLE_SA_EMAIL` e `GOOGLE_SA_PRIVATE_KEY`, si condivide il foglio in sola lettura con l'email dell'account e si scrive anche il "Nome della scheda" (quello sulla linguetta in basso). Il file JSON dell'account non entra mai nel repo né nel wiki.
- **Colonna del telefono:** conviene impostarla come "Testo normale" (Formato, Numero, Testo normale) nel foglio, così Google non toglie il "+" o lo zero iniziale dei numeri.
- **Accendere la lettura:** prima "Anteprima" sulle prime righe vere (azienda, referente, telefono ed email al posto giusto, nessuna "Colonna non trovata"; se una colonna non torna si corregge la mappa), poi si accende la lettura automatica e si salva.
- **Arretrato:** il giro automatico crea 1 lead per giro quando nel giro c'è anche altro, cioè quasi sempre (12 lead l'ora), e fino a 2 quando è solo. Per smaltire un arretrato si usa "Leggi adesso", che continua a leggere finché arriva in fondo al foglio. I lead già arrivati da Meta risultano già presenti, non doppioni.

## Email di conferma

Al lead nuovo che arriva da Meta o dal Foglio Andrea (non a quelli inseriti a mano) parte subito un'email di conferma con Resend, una sola per lead (non ai doppioni di un lead già confermato), dal mittente `Tommaso di Acceleriamo <tommaso@mail.acceleriamo.it>` con risposta a `tommaso@acceleriamo.it` (si cambiano in Impostazioni). Il dominio `mail.acceleriamo.it` deve essere verificato su Resend prima di mettere la chiave.

- **Piede legale:** "Acceleriamo è un progetto di Diego Simoncini, P.IVA 02524780505", seguito dal link all'informativa privacy. È già il valore di partenza nel codice (`worker/impostazioni/default.ts`) e si può cambiare in Impostazioni.
- **Tentativi:** al massimo 4: il primo invio, alla creazione del lead, più tre ritentativi dal giro automatico. Un indirizzo rifiutato da Resend non si ritenta. Dopo l'ultimo tentativo la scheda del lead dice che l'email non è partita.
- **Regola delle 48 ore:** quando Resend viene collegato, le richieste arrivate più di 48 ore prima non ricevono la conferma (un'email di benvenuto dopo giorni sembra strana): vengono segnate "Non mandata: richiesta arrivata più di 48 ore prima del collegamento di Resend", senza ritentativi.
- Con la conferma spenta in Impostazioni, i lead già in coda restano in coda e ripartono quando la si riaccende (sempre con il limite delle 48 ore).

## Posta di Tommaso (tommaso@acceleriamo.it)

Il gestionale legge la casella in sola lettura: non segna niente come letto, non sposta, non cancella e non manda mail.
Tre cose entrano da sole:

- **Inviti di Google Meet** (mail con l'invito di calendario): aggiornano la call del lead giusto con data, ora, durata e link.
  Il lead si trova prima dall'email dei partecipanti, poi dal nome del partecipante o dall'azienda nel titolo.
  Se non lo trova, o ne trova più di uno, non inventa: arriva l'avviso "Invito Meet senza lead".
  Un invito spostato sposta la stessa call; uno annullato lascia la call e scrive nello storico che va riprogrammata.
- **Richieste dal modulo di acceleriamo.it**: diventano lead nuovi (fonte Sito), con le risposte del modulo nelle note.
  Se l'email o il telefono sono già di un lead, nessun doppione: la richiesta finisce nello storico di quel lead.
- **Risposte dei lead** (mail da un indirizzo già di un lead): nello storico del lead, solo la parte nuova senza le citazioni.

Come funziona: il Worker sul piano gratuito ha 10 ms di CPU e 50 richieste a giro, già usati dal cron, quindi la casella
non la legge lui. La legge lo script `scripts/posta/leggi_posta.py` (Python, solo libreria standard), che gira su una
macchina sempre accesa e passa ogni mail nuova a `POST /api/hooks/posta`, protetta dalla chiave `MAIL_HOOK_KEY`.
Lo stato in Impostazioni > Integrazioni, riga "Posta di Tommaso".

Per accenderla:

1. Generare una chiave lunga a caso e metterla nel Worker: `npx wrangler secret put MAIL_HOOK_KEY` (account di Diego).
   Prima del deploy va applicata la migrazione `0017_posta` (`npm run db:migrate:remote`).
2. Sulla macchina che legge: password della casella e stessa chiave come variabili d'ambiente
   (`MAIL_TOMMASO_PASSWORD`, `MAIL_HOOK_KEY`) oppure nel portachiavi del Mac
   (servizi `acceleriamo-mail-tommaso` e `acceleriamo-mail-hook`). Mai nel codice.
3. Prova senza mandare niente: `python3 scripts/posta/leggi_posta.py --mostra`.
4. Giro vero ogni 5 minuti (launchd sul Mac o timer sul server): `python3 scripts/posta/leggi_posta.py`.
   Al primo giro legge solo le mail degli ultimi 14 giorni (`MAIL_GIORNI_INIZIALI`).

Server: `imaps.aruba.it`, porta 993 (verificato il 26/10/2026). Prove: `tests/posta.test.ts` e
`python3 -m unittest scripts/posta/test_leggi_posta.py`, con mail finte in `scripts/posta/fixture/`.

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

Una copia dell'app con dati finti, da mostrare a clienti e collaboratori senza aprire i dati veri.

Indirizzo: https://acceleriamo-os-demo.acceleriamo-os.workers.dev

Utente: `demo`, con la password scelta al ripristino (almeno 12 caratteri).

È un secondo Worker (`acceleriamo-os-demo`) con il suo database D1 (`acceleriamo-os-demo`): stesso codice, ambiente `demo` in `wrangler.jsonc` (con `SPAZIO: "demo"`), nessun cron. In testa a ogni pagina compare "Spazio demo, dati finti"; in Impostazioni > Integrazioni ogni servizio dice "Spazio demo"; il Foglio Andrea non si legge.

**Regola: nessun segreto nella demo.** Non si lancia mai `wrangler secret put` con `--env demo`. In più il codice ha una guardia: nella demo push, Telegram, email, Claude, Meta e foglio non partono comunque. Le prove di invio, il cambio password e il cambio nome rispondono con un messaggio neutro ("Sei nello spazio demo..."); le preferenze del profilo restano libere; la prova delle push dà "errore".

I dati (40 lead in sei settori, call, proposte, schede azienda, analisi del coach, tre clienti con automazioni, canoni e fatture) stanno in `scripts/demo-dati.ts`. Email e link della call solo su `esempio.invalid`, telefoni con prefisso `+39 000`: nessun messaggio può arrivare a una persona vera.

Prima volta (con le credenziali Cloudflare esportate come sopra):

```bash
npx wrangler d1 create acceleriamo-os-demo   # copia l'id stampato in wrangler.jsonc, ambiente demo, al posto degli zeri
npm run db:migrate:demo                      # crea le tabelle nel database della demo
npm run demo:reset                           # semina i dati finti, chiede la password dell'utente demo
npm run deploy:demo                          # pubblica la demo
curl -s https://acceleriamo-os-demo.acceleriamo-os.workers.dev/api/health   # deve rispondere {"ok":true}
```

**Ripristino prima di ogni call** in cui si mostra la demo:

```bash
npm run demo:reset
```

Cosa rimette:

- i dati finti di partenza (utente `demo`, lead, attività, call, proposte, schede azienda, analisi del coach, clienti, automazioni, canoni, fatture);
- fasi, regole delle fasi, modelli dei messaggi e impostazioni come dopo le migrazioni.

Cosa svuota e non rimette:

- avvisi, coda e registro di Claude, registro delle modifiche e dell'aggancio, stato delle integrazioni;
- spese delle campagne, revisioni del lunedì (la demo non ha cron, quindi restano vuote), costi;
- dispositivi push e sessioni: chi era dentro deve rientrare.

Non tocca mai il database di produzione e non cambia il codice pubblicato.

**Pubblicare una versione nuova della demo** (dopo la produzione):

```bash
npm run db:migrate:demo && npm run deploy:demo
```

In locale: `npm run db:migrate:demo:locale` una volta, poi `npm run demo:locale`.

## Schede dei lead

Dal Piano B la scheda azienda di ogni lead nuovo la prepara l'app, con Claude, e si vede nella scheda del lead (si stampa da lì).

Il vecchio server Python delle schede (`schede-lead.py`, nel wiki) resta acceso per due settimane dal collaudo con il lead di prova di Meta. **Finché è acceso, ogni lead nuovo ha due schede**: quella dell'app e quella del vecchio server. È previsto.

Dopo le due settimane, se l'app ha fatto la scheda per ogni lead nuovo, Tommaso spegne l'avvio automatico di `schede-lead.py` sul server. Questo repo non lo tocca.

- Collaudo con il lead di prova: da scrivere (giorno/mese/anno).
- Spegnimento del vecchio server: da scrivere (due settimane dopo).

## Documenti dei lead (file su R2)

Dal 29/10/2026 la sezione Documenti della scheda lead accetta file veri: PDF, TXT, Excel (xls, xlsx, csv), Word (doc, docx),
audio (m4a, mp3, ogg, opus, wav, aac), immagini (jpg, png, heic), fino a 100 MB. I link restano possibili.
Ogni file ha le sue versioni; il pallino arancione in lista e su "Documenti" conta i file e le versioni messi da un'altra
persona e non ancora visti, e si azzera aprendo la scheda. I file non sono pubblici: passano solo da `/api/documents/:id/file`
con la sessione. Bucket: `acceleriamo-os-documenti` (binding `DOCUMENTI`), demo `acceleriamo-os-demo-documenti`.

Togliere un documento lo nasconde subito; dopo 30 giorni il giro programmato (ogni giorno alle 6:40 di Roma, a lotti
di 20) cancella davvero i file su R2 di tutte le versioni e poi le righe. Nello stesso giro toglie le cartelle R2
`lead/<id>/` di lead che non esistono più nel database (i lead nel cestino restano). Voce nella pagina Stato:
"Documenti tolti oltre 30 giorni" (spenta finché il bucket non è collegato). Decisione di Tommaso del 29/10/2026.

Messa online (una volta):
1. Su Cloudflare attivare R2 e creare i due bucket (o dare il permesso "R2: modifica" alla chiave del deploy e lanciare
   `npx wrangler r2 bucket create acceleriamo-os-documenti` e `npx wrangler r2 bucket create acceleriamo-os-demo-documenti`).
2. Copia del database, poi `npm run db:migrate:remote` (migrazione `0021_documenti_file`) e `npm run db:migrate:demo`.
3. Segreto dello script: generare un token lungo (`openssl rand -base64 32`), `npx wrangler secret put CARICA_TOKEN`,
   e la stessa stringa nel portachiavi del Mac di Tommaso:
   `security add-generic-password -a "$USER" -s acceleriamo-carica-token -w '<token>'`.
4. `npm run deploy` (e `npm run deploy:demo`).

Script per caricare dal Mac (le voci risultano di Tommaso, "caricato da Claude"):

```
npm run carica -- --lead "Nome azienda" percorso/file.m4a
npm run carica -- --lead-id <id> preventivo.pdf --versione   # nuova versione del documento con lo stesso nome
```

Indirizzo di default `https://risorse.acceleriamo.it`; `--base http://localhost:5173` per il server locale
(token da `ACCELERIAMO_CARICA_TOKEN` in prova). Esce con 2 se il lead non si trova o non è unico.

## Scelte da sapere

- **Sposta in fase e Abbina:** dopo aver scelto la fase o il lead serve il pulsante principale ("Sposta in X", "Abbina a X"), spento finché non c'è la scelta. Vale anche per un solo lead dal menu rapido e per "Assegna N a X" nelle azioni in blocco della Scaletta. Prima bastava il tocco.
- **Call nel passato:** una call si registra o si fissa fino a 15 minuti nel passato. Oltre, la schermata scrive "La call è nel passato" sotto la data. Non c'è un modo per registrare una call già fatta e mai fissata.
- **Telegram:** arretrato di 6 ore al collegamento (vedi "Avvisi, push e Telegram").
- **Telefono ed email della scheda lead** sono link semplici: toccarli non registra il tentativo come "Chiama".
- **Freccia indietro della scheda:** torna alla pagina di prima, o a Scaletta se la scheda è aperta da un link diretto.
- **Campagne:** con una sola campagna il dettaglio parte aperto, con due o più tutte chiuse; cambiando mese si richiudono.
- **Lunedì:** il "Commento precedente" sta sotto lo stato del commento nuovo.
- **Conferma spenta:** i lead già in coda restano in coda e ripartono alla riaccensione, con il limite delle 48 ore.
- **Template del preventivo del wiki:** non ha ancora i campi numero, lead, setup, canone e validità (vedi "Proposte dal wiki").

## Font: licenza di Degular Display

I tre file di Degular Display in `public/fonts/` (`DegularDisplay-Medium.otf`, `DegularDisplay-Semibold.otf`, `DegularDisplay-Bold.otf`) sono la **versione Demo di OH no Type**, con licenza solo per prove. Non si possono usare in produzione e mancano alcuni segni (€ ’ « » … °).

Prima dell'uso vero:

1. Tommaso compra la licenza web di Degular Display per i pesi 500, 600 e 700.
2. Chi tiene il codice sostituisce i tre file in `public/fonts/` con quelli definitivi (stessi nomi, o si aggiornano i nomi nel CSS).
3. In `public/sw.js` porta `VERSIONE` da `guscio-v2` a `guscio-v3`, così i telefoni buttano la copia vecchia dei font.
4. `npm run e2e:foto`, si guardano le foto, poi commit e pubblicazione.

Se un file manca, il CSS ripiega su Inter.

## Chi fa cosa

**Tommaso:**

- dà la chiave di Anthropic e mette il limite di 25 dollari sul workspace su console.anthropic.com;
- crea il bot con BotFather (token e nome utente);
- compra la licenza di Degular Display;
- sceglie la password dell'utente demo;
- incolla i valori dei segreti quando `wrangler secret put` li chiede;
- fa il collaudo con Diego (Telegram, push sull'iPhone, lead di prova, coach, tetto, lunedì);
- spegne il vecchio server delle schede dopo due settimane.

**Chi tiene il codice:**

- genera le chiavi VAPID e scrive in `wrangler.jsonc` la pubblica e il nome del bot;
- fa la copia del database, il controllo dei doppioni, le migrazioni e la pubblicazione, nell'ordine di "Mettere online";
- pubblica e ripristina lo spazio demo;
- sostituisce i font e porta il service worker a `guscio-v3`;
- aggiorna il listino di Claude se Anthropic cambia i prezzi;
- scrive in questo README le date del collaudo e dello spegnimento.

## Aggiungere un utente

Come in locale, ma per il database online si usa `--remote` al posto di `--local` nel comando che lo script stampa:

```bash
npx tsx scripts/create-user.ts <utente> "<Nome>"
```

Poi lancia il comando stampato (con `--remote`) e cancella il file `create-user-<utente>.local.sql`.

## Cartelle

- `worker/`: server (accesso, lead, regole, call, proposte, foglio, email, economia, automazioni, controllo automatico, avvisi, push, Telegram, Claude, numeri, lunedì, diario, dati, ricerca)
- `src/`: interfaccia (design system in `src/ds/`, pagine in `src/pagine/`, guscio dell'app in `src/guscio/`)
- `public/`: font, icone, `manifest.webmanifest` e service worker (`sw.js`) dell'app installabile
- `drizzle/`: migrazioni del database
- `scripts/`: creazione utenti, passaggio dati dal vecchio prototipo, dati e ripristino dello spazio demo
- `tests/`: test automatici
- `e2e/`: controlli con Playwright e foto di confronto

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
