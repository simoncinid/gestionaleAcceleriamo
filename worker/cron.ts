import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { consegnaPush } from "./avvisi/consegna";
import { pushCollegate } from "./push/invio";
import { COSTO_AVVISI, controllaAvvisi, controllaMeta48 } from "./avvisi/controlli";
import { getDb, type Db } from "./db/client";
import { activities, proposals } from "./db/schema";
import { generaRicorrenti } from "./lavori/service";
import { mandaInvitiInCoda } from "./calls/service";
import { lavoraCoda, orologioCoda } from "./claude/coda";
import "./claude/tipi";
import { ritentaConferme } from "./email/conferma";
import type { Env } from "./env";
import { giroFoglio } from "./foglio/sync";
import { leggiImpostazioni } from "./impostazioni/service";
import { segnaErrore, segnaOk } from "./integrazioni/stato";
import { contaD1, QUERY_GIRO, SOTTORICHIESTE_GIRO } from "./lib/bilancio";
import { partiRoma, type PartiRoma } from "./lib/roma";
import { revisioneCorrente } from "./lunedi/calcolo";
import { retryPendingMetaLeads } from "./meta/ingest";
import { giroTelegram } from "./telegram/bot";

export type Lavoro = "avvisi" | "consegna" | "foglio" | "meta" | "meta_48h" | "conferme" | "claude" | "telegram" | "proposte_scadute" | "lavori" | "lunedi";

// Ogni lavoro dichiara quanto costa: query fisse (letture di impostazioni e stato), query per unità
// (un lead, una conferma, un invito, una push) e sottorichieste per unità. Misure con contaD1, che conta anche
// gli statement dentro le batch: foglio 5 fisse più 20 per lead nuovo, Meta 1 più 16 per lead (l'avviso
// "Lead nuovo" della catena aggiunge una query a lead), avvisi 8 fisse più una per avviso, consegna delle push
// 3 fisse più 2 a push (una sottorichiesta a push), Telegram 2 fisse più 1 a unità, conferma 1 più 6, invito circa 6,5. Le sottorichieste fisse (la lettura del foglio) stanno dentro la stima
// per unità, che è larga: foglio 2 per lead (CSV più email di conferma), Meta 2 (Graph più email).
export type DefLavoro = {
  quando: (p: PartiRoma) => boolean;
  fisse: number;
  perUnita: number;
  sottoPerUnita: number;
  max: number;
  // Budget lasciato ai lavori che vengono dopo (la consegna delle push): il lavoro prende le sue unità solo
  // da quello che resta tolta la riserva. Vale solo se le push sono collegate.
  riserva?: { query: number; sotto: number };
  // Un lavoro può restituire { sottorichieste: n } con quelle usate davvero: le altre prenotate tornano al giro.
  // inizio: l'ora vera di partenza del giro (orologio della coda di Claude), per i lavori che devono
  // smettere di avviare cose nuove dopo un certo tempo di giro.
  esegui: (env: Env, now: number, limite: number, inizio?: number) => Promise<unknown>;
};

// Spec 16, frequenze. Il blocco è di 5 minuti: un giro partito in ritardo di qualche secondo resta il suo.
const blocco = (p: PartiRoma) => Math.floor(p.minuti / 5);
const ogni15 = (p: PartiRoma) => blocco(p) % 3 === 0;
const sempre = () => true;
const alle6 = (p: PartiRoma) => p.ore === 6 && p.minuti < 5;

// Foglio, Meta e avvisi (i lavori prima della consegna) lasciano sempre alla consegna 7 query e 2 sottorichieste
// (3 fisse più 2 push): anche con un arretrato nel foglio ogni giro manda almeno 2 push. Con le push collegate e
// un arretrato nel foglio, alle :15 Meta non entra più (25 + 18 + 7 > 44) e riprova al quarto d'ora dopo;
// gli avvisi nascono a gruppi più piccoli.
const RISERVA_PUSH = { query: 7, sotto: 2 };

// L'ordine delle chiavi è la priorità: prima ciò che tocca un lead che aspetta, poi il resto.
// Eccezione: le proposte scadute girano solo alle 6:00 e chiedono 42 query fisse, quindi passano per prime
// in quel giro (come nel Piano A, da sole): Meta e conferme saltano e riprovano ai giri dopo.
export const LAVORI: Partial<Record<Lavoro, DefLavoro>> = {
  proposte_scadute: { quando: alle6, fisse: 42, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => scadiProposte(getDb(e.DB), n) },
  // Criterio 1 della spec: un lead del foglio in Scaletta entro 10 minuti. Il foglio gira a ogni giro
  // (tranne alle 6:00, che è delle proposte) e prende quanti lead il budget consente, al massimo 2.
  // Con un arretrato grande (prima lettura del foglio) il foglio non deve affamare Meta e conferme: se nel
  // giro è in programma un altro lavoro prende al massimo 1 lead (25 query), da solo fino a 2 se il budget li copre.
  foglio: { quando: (p) => !alle6(p), fisse: 5, perUnita: 20, sottoPerUnita: 2, max: 2, riserva: RISERVA_PUSH, esegui: (e, n, l) => giroFoglio(e, n, altriInProgramma("foglio", n) ? Math.min(1, l) : l) },
  meta: { quando: ogni15, fisse: 2, perUnita: 16, sottoPerUnita: 2, max: 2, riserva: RISERVA_PUSH, esegui: (e, _n, l) => retryPendingMetaLeads(e, l) },
  // Avvisi in app (spec 8): a ogni giro, dopo l'ingresso dei lead. Un lead che non è ancora entrato non si può
  // chiamare, quindi foglio e Meta passano prima; con un arretrato nel foglio alle :15 gli avvisi aspettano
  // il giro dopo (5 minuti, dentro i 30 del preavviso). Fisse 8 (letture e chiusure), una query per unità.
  avvisi: { quando: sempre, ...COSTO_AVVISI, sottoPerUnita: 0, riserva: RISERVA_PUSH, esegui: (e, n, l) => controllaAvvisi(e, n, l) },
  // Push (spec 8): subito dopo gli avvisi, così l'avviso nato in questo giro (SLA, "Lead nuovo" della catena di
  // foglio e Meta) arriva sul telefono nello stesso giro. Prima delle conferme: una push SLA vale più di un'email
  // di conferma da ritentare, che può aspettare 5 minuti. Misura con contaD1: 2 letture più una batch con al
  // massimo una scrittura per push e una per avviso letto (al massimo il limite), quindi 3 fisse e 2 a unità;
  // una sottorichiesta per push, al massimo 10 per giro. Senza chiavi VAPID costa zero query e non manda niente.
  consegna: {
    quando: sempre, fisse: 3, perUnita: 2, sottoPerUnita: 1, max: 10,
    // Le sottorichieste prenotate e non usate (meno push del limite) tornano al giro per i lavori dopo.
    esegui: async (e, n, l) => ({ sottorichieste: (await consegnaPush(e, n, l)).inviate }),
  },
  // Telegram (spec 8.4): solo "Lead nuovo", "SLA scaduto" e "Claude al tetto", subito dopo le push per lo stesso
  // motivo. Misura con contaD1: una lettura (codici, avvisi, coda e stato in una query) più una batch con una
  // scrittura a unità (lo stato in Integrazioni usa un'unità) e una di pulizia, quindi 2 fisse e una a unità; una sottorichiesta a unità (un messaggio, oppure
  // getUpdates e la sua conferma come 2 unità quando qualcuno sta collegando la chat, più una per la risposta a un codice sbagliato). Al massimo 5 per giro.
  // Senza token del bot costa zero e restituisce tutte le sottorichieste prenotate.
  telegram: {
    quando: sempre, fisse: 2, perUnita: 1, sottoPerUnita: 1, max: 5,
    esegui: async (e, n, l) => ({ sottorichieste: (await giroTelegram(e, n, l)).sottorichieste }),
  },
  // Conferme e inviti si dividono lo stesso limite: ogni unità (una conferma o un invito) costa al massimo
  // 7 query e una sottorichiesta, così il budget conta anche gli inviti.
  conferme: {
    quando: sempre, fisse: 2, perUnita: 7, sottoPerUnita: 1, max: 7,
    esegui: async (e, n, l) => {
      // Prima gli inviti (fino a metà del limite, arrotondata in su): con un limite di 1 l'invito parte lo stesso.
      // Le conferme prendono quello che gli inviti non hanno usato.
      const fatti = await mandaInvitiInCoda(e, n, Math.min(2, Math.ceil(l / 2)));
      if (l - fatti > 0) await ritentaConferme(e, n, l - fatti);
    },
  },
  // Spec 8: Meta senza lead da 48 ore, una volta l'ora (giro delle :00). 3 query misurate.
  meta_48h: { quando: (p) => p.minuti < 5, fisse: 3, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => controllaMeta48(e, n) },
  // Task ricorrenti dei lavori (dal ramo main): alle 7:00 e alle 7:30 di Roma il giro crea la task del mese per ogni
  // lavoro attivo, se oggi è il giorno indicato o dopo (una sola per mese: indice unico su lavoro, modello e mese).
  // Non tocca un lead che aspetta, quindi viene dopo i lavori dei lead e il controllo di Meta delle :00; sta prima
  // della revisione del lunedì e di Claude perché costa poco e gira due volte al giorno: se il budget non basta,
  // la seconda passata delle 7:30 recupera. Misura con contaD1: 2 letture (lavori con i modelli ricorrenti, task
  // del mese) più una batch con una scrittura per task, quindi 2 fisse e una a unità, al massimo 12; nessuna sottorichiesta.
  lavori: {
    quando: (p) => p.ore === 7 && (p.minuti < 5 || (p.minuti >= 30 && p.minuti < 35)),
    fisse: 2, perUnita: 1, sottoPerUnita: 0, max: 12,
    esegui: (e, n, l) => generaRicorrenti(getDb(e.DB), n, l),
  },
  // Lunedì (spec 6.4): il lunedì dalle 7:00 alle 7:55 (ora di Roma) il giro congela i numeri della settimana chiusa
  // in weekly_reviews. Dopo il lead e i suoi avvisi, prima di Claude: se il budget non basta riprova al giro dopo.
  // La revisione nasce una volta sola per settimana (settimana unica, ON CONFLICT): nei giri dopo il primo costa
  // una query e Claude riceve il resto, perché il giro conta le query vere. Fisse 15, misurate con contaD1 al
  // primo giro: 1 lettura, 11 del calcolo, 1 scrittura, 1 rilettura (14, una di margine).
  lunedi: { quando: (p) => p.settimana === 1 && p.ore === 7, fisse: 15, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: (e, n) => revisioneCorrente(e.DB, n) },
  // Claude (spec 7.4): ultimo del giro, dopo le conferme e dopo il controllo di Meta delle :00, che gira una volta
  // l'ora e non deve perdere il suo turno. Un lavoro di Claude può aspettare 5 minuti, un lead no.
  // Misura con contaD1: fisse 8 (in una batch da 3 la classificazione dei lead nuovi che si accoda da sola e la
  // riapertura dei fermi; poi coda con lo speso del mese, impostazioni, fermi, avviso del tetto, stato), per lavoro 4 (presa con la prenotazione del costo massimo e chiusura, due batch
  // da 2) più al massimo 7 del gestore del tipo, quindi 11; sottorichieste 3 a lavoro (la chiamata più due
  // continuazioni di pause_turn).
  // Al massimo 3 per giro (lavoriPerGiro in Impostazioni può abbassarlo). Senza chiave o senza tipi costa zero.
  claude: {
    quando: sempre, fisse: 8, perUnita: 11, sottoPerUnita: 3, max: 3,
    esegui: async (e, n, l, inizio) => {
      // I 9 minuti senza lavori nuovi contano dall'inizio del giro, non dall'ingresso nella coda.
      const r = await lavoraCoda(e, n, l, inizio);
      return { ...r, sottorichieste: (r.fatti + r.errori) * 3 };
    },
  },
};

// Vero se nel giro di questo istante c'è in programma almeno un altro lavoro oltre a quello indicato.
function altriInProgramma(nome: Lavoro, now: number): boolean {
  const p = partiRoma(now);
  return Object.entries(LAVORI).some(([k, d]) => k !== nome && d!.quando(p));
}

export function registraLavoro(nome: Lavoro, def: DefLavoro) {
  LAVORI[nome] = def;
}

export function limiteDi(def: DefLavoro, residuoQuery: number, residuoSotto: number, conRiserva = false): number {
  if (conRiserva && def.riserva) {
    residuoQuery -= def.riserva.query;
    residuoSotto -= def.riserva.sotto;
  }
  if (residuoQuery < def.fisse) return 0;
  const perQuery = def.perUnita > 0 ? Math.floor((residuoQuery - def.fisse) / def.perUnita) : def.max;
  const perSotto = def.sottoPerUnita > 0 ? Math.floor(residuoSotto / def.sottoPerUnita) : def.max;
  return Math.max(0, Math.min(def.max, perQuery, perSotto));
}

// Spec 6.8: validità di 30 giorni. Senza data di validità conta l'invio più i giorni di Impostazioni.
export async function scadiProposte(db: Db, now: number): Promise<number> {
  const { validita } = await leggiImpostazioni(db);
  const limite = sql`coalesce(${proposals.validUntil}, ${proposals.sentAt} + ${validita.giorni * 86_400_000})`;
  const scadute = await db.select({ id: proposals.id, number: proposals.number, leadId: proposals.leadId }).from(proposals)
    .where(and(inArray(proposals.status, ["registrata", "presentata"]), isNull(proposals.deletedAt), lt(limite, now)))
    .limit(20); // due scritture per proposta: 20 stanno sotto le 50 query; le altre il giorno dopo
  if (!scadute.length) return 0;
  const passi = scadute.flatMap((p) => [
    db.update(proposals).set({ status: "scaduta", decidedAt: now, updatedAt: now }).where(eq(proposals.id, p.id)),
    ...(p.leadId ? [db.insert(activities).values({ id: crypto.randomUUID(), leadId: p.leadId, type: "proposta" as const, body: `Preventivo ${p.number} scaduto`, authorId: null, createdAt: now })] : []),
  ]);
  await db.batch(passi as [(typeof passi)[number], ...(typeof passi)[number][]]);
  return scadute.length;
}

// Un lavoro che fallisce non ferma gli altri; il giro diventa rosso con l'elenco degli errori.
// Le query si contano davvero (contaD1); le sottorichieste si prenotano dalla stima del lavoro.
export async function giro(env: Env, now: number): Promise<{ fatti: Lavoro[]; saltati: Lavoro[]; errori: string[]; query: number }> {
  if (env.SPAZIO === "demo") return { fatti: [], saltati: [], errori: [], query: 0 };
  const inizio = orologioCoda();
  const contatore = { query: 0 };
  const envContato: Env = { ...env, DB: contaD1(env.DB, contatore) };
  const p = partiRoma(now);
  const fatti: Lavoro[] = [];
  const saltati: Lavoro[] = [];
  const errori: string[] = [];
  let sotto = SOTTORICHIESTE_GIRO;
  const RISERVA_FINALE = 1; // la riga "giro" in integration_status
  const conRiserva = pushCollegate(env); // senza chiavi VAPID la consegna non spende niente: niente riserva
  for (const [nome, def] of Object.entries(LAVORI) as [Lavoro, DefLavoro][]) {
    if (!def.quando(p)) continue;
    const limite = limiteDi(def, QUERY_GIRO - RISERVA_FINALE - contatore.query, sotto, conRiserva);
    if (limite < 1) {
      saltati.push(nome);
      continue;
    }
    sotto -= limite * def.sottoPerUnita;
    try {
      const esito = await def.esegui(envContato, now, limite, inizio);
      const usate = (esito as { sottorichieste?: unknown } | null)?.sottorichieste;
      if (typeof usate === "number") sotto += Math.max(0, limite * def.sottoPerUnita - usate);
      fatti.push(nome);
    } catch (e) {
      errori.push(`${nome}: ${(e as Error).message}`);
    }
  }
  // Anche la riga "giro" passa dal contatore: query restituito è il totale vero dell'invocazione.
  const db = getDb(envContato.DB);
  if (errori.length) await segnaErrore(db, "giro", errori.join("; "), now);
  else await segnaOk(db, "giro", now);
  return { fatti, saltati, errori, query: contatore.query };
}
