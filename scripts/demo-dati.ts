// Dati finti dello spazio demo (spec 12). Funzione pura: niente rete, niente file, niente orologio.
// Aziende, referenti e contatti sono inventati: email e siti solo su esempio.invalid (dominio riservato, non apre
// pagine di terzi), telefoni con prefisso +39 000.
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { CoachSalvato } from "../worker/claude/coach";
import {
  activities, automationSteps, automations, callAnalyses, calls, clients, companyProfiles, fees, invoices, jobs, leads, PROPOSAL_STATUSES, proposals, settings, tasks, users,
} from "../worker/db/schema";
import { normalizeEmail, normalizePhone } from "../worker/lib/normalize";
import { giorniLavorativiDopo } from "../worker/processo/processo";
import { ORARIO_DEFAULT, scadenzaLavorativa } from "../worker/regole/orario";
import { primoMeseRicorrenti, scadenzaRicorrente, scadenzaUnaTantum } from "../worker/lavori/calcoli";
import { daRoma, meseRoma, partiRoma } from "../worker/lib/roma";

type Riga<T extends SQLiteTable> = T["$inferInsert"];
export type DatiDemo = {
  users: Riga<typeof users>[]; settings: Riga<typeof settings>[]; leads: Riga<typeof leads>[]; calls: Riga<typeof calls>[]; proposals: Riga<typeof proposals>[];
  clients: Riga<typeof clients>[]; automations: Riga<typeof automations>[]; fees: Riga<typeof fees>[]; invoices: Riga<typeof invoices>[];
  companyProfiles: Riga<typeof companyProfiles>[]; callAnalyses: Riga<typeof callAnalyses>[]; activities: Riga<typeof activities>[];
  jobs: Riga<typeof jobs>[]; tasks: Riga<typeof tasks>[]; automationSteps: Riga<typeof automationSteps>[];
};

// Lavoro tipo predefinito (migrazione 0008_dati_lavori): le cinque una tantum con i giorni dall'avvio e le due ricorrenti.
const MODELLO_DEMO = "lt-automazione-su-misura";
const UNA_TANTUM_DEMO: [string, string, number][] = [
  ["ltt-1", "Onboarding", 3], ["ltt-2", "Raccolta requisiti", 7], ["ltt-3", "Sviluppo della soluzione", 30],
  ["ltt-4", "Collaudo con il cliente", 40], ["ltt-5", "Messa in produzione", 45],
];
const RICORRENTI_DEMO: [string, string][] = [["ltt-6", "Manda la fattura del mese"], ["ltt-7", "Controlla che l'automazione funzioni"]];
// Passaggi del flusso della prima automazione finta: generici, senza nomi di clienti o strumenti veri.
const PASSAGGI_DEMO: [string, string, string | null, string][] = [
  ["Arriva una richiesta", "Le richieste dal sito e dalle email finiscono in un unico punto.", null, "envelope"],
  ["Lettura della richiesta", "Il testo viene letto e ordinato: chi scrive, cosa chiede, quanto è urgente.", null, "sparkle"],
  ["Smistamento", "La richiesta va alla persona giusta del team.", null, "shuffle"],
  ["Risposta di cortesia", "Chi ha scritto riceve subito una conferma.", "Se la richiesta è urgente", "paperplane"],
];

const GIORNO = 86_400_000;
// Nomi d'azienda chiaramente inventati (giochi di parole sul mestiere), per non somigliare ad aziende vere della zona.
const SETTORI: [string, string[]][] = [
  ["Officina meccanica", ["Officina Bullonetti", "Autofficina Pistonfino", "Meccanica Frizionelli", "Officina F.lli Marmittoni", "Car Service Cambiolesto", "Officina Ruotaliscia", "Revisioni Contachilometri"]],
  ["Agenzia immobiliare", ["Immobiliare Mattonelli", "Casa Tegolina", "Agenzia Portoncino", "Immobiliare Davanzali", "Abitare Finestrelli", "Studio Immobiliare Soffittini", "Case Comignolo"]],
  ["Studio commercialista", ["Studio Partitadoppia", "Studio Fiscale Scontrinelli", "Commercialisti Associati Bilancini", "Studio Ricevutini", "Studio Tributario Aliquotti", "Studio Contabile Registrini", "Studio Fatturelli"]],
  ["Impianti elettrici", ["Elettro Impianti Voltolini", "Impianti Watteschi", "Elettrotecnica Amperini", "Luce Interruttorini", "Impianti Cavetti", "Elettrica Fusibilini"]],
  ["Logistica e trasporti", ["Trasporti Pacchettoni", "Logistica Bancalina", "Corrieri Scatoloni", "Spedizioni Nastrino", "Autotrasporti Rimorchietti", "Magazzini Scaffaloni"]],
  ["Studio dentistico", ["Studio Dentistico Molarini", "Centro Dentale Canini", "Odontoiatria Incisivi", "Studio Dentistico Smaltini", "Sorriso Spazzolino", "Dentisti Associati Gengivelli", "Studio Dentale Collutorio"]],
];
// Automazioni dei clienti finti, coerenti con il loro settore (la seconda serve se due clienti fanno lo stesso mestiere).
export const AUTOMAZIONI_SETTORE: Record<string, [string, string][]> = {
  "Officina meccanica": [["Promemoria revisioni e tagliandi", "Messaggi e conferme"], ["Preventivi dalle foto del cliente", "Documenti"]],
  "Agenzia immobiliare": [["Smistamento richieste dai portali", "Email"], ["Promemoria visite agli immobili", "Messaggi e conferme"]],
  "Studio commercialista": [["Raccolta documenti dei clienti", "Documenti"], ["Scadenzario fiscale per i clienti", "Report"]],
  "Impianti elettrici": [["Rapportini di intervento dal telefono", "Documenti"], ["Promemoria manutenzioni", "Messaggi e conferme"]],
  "Logistica e trasporti": [["Ordini dalle email al gestionale", "Documenti"], ["Avvisi di consegna ai clienti", "Messaggi e conferme"]],
  "Studio dentistico": [["Promemoria appuntamenti", "Messaggi e conferme"], ["Richiami per l'igiene", "Messaggi e conferme"]],
};
const CAMPAGNE = ["Lavoro ripetuto, video", "Excel e gestionale, carosello", "Telefonate perse, video"];
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SCHEDA = (azienda: string, settore: string) => `## Chi è
Dati finti dello spazio demo. ${azienda} è un'azienda del settore "${settore.toLowerCase()}" con una decina di persone, una sede e molti clienti abituali.

## Cosa fa l'azienda
Lavora soprattutto con privati e piccole imprese della provincia. Gran parte del tempo dell'ufficio va in telefonate, promemoria e fogli Excel aggiornati a mano.

## Sito e presenza online
Sito vetrina semplice, nessun modulo di contatto collegato al gestionale.

## Dove possiamo fare la differenza
1. Promemoria automatici ai clienti, con conferma o spostamento in un messaggio.
2. Riepilogo serale delle attività del giorno, già pronto per il titolare.
3. Lettura automatica delle email in arrivo e smistamento a chi deve rispondere.

## Da chiarire in call
Quale gestionale usano, chi aggiorna oggi i fogli, quante telefonate al giorno.`;

// Stesso formato che il coach salva in call_analyses.result (CoachSalvato, Task 8).
const coach = (prossimaAzioneAt: number): CoachSalvato => ({
  riassunto: "Call di conoscenza andata bene: il titolare passa due ore al giorno a ricopiare ordini dalle email al gestionale.",
  faseSuggerita: "presentazione-confermata",
  prossimaAzione: { testo: "Fissare la call di presentazione con la proposta", entroGiorni: 3 },
  bozzaFollowUp: "Buongiorno, grazie per il tempo di oggi. Come detto, preparo una proposta per togliere la ricopiatura degli ordini: la vediamo insieme in una call di mezz'ora la prossima settimana?",
  risposteObiezioni: [{ obiezione: "Teme di dover cambiare gestionale", risposta: "L'automazione lavora sul gestionale che usa già: legge le email e compila gli ordini, senza cambiare programma." }],
  controlli: ["Chiedere quante persone toccano gli ordini", "Verificare chi aggiorna oggi il gestionale"],
  prossimaAzioneAt,
});

// Undici lead (contratto blocco 1, sezioni 6 e 10, modifica 5): uno per fase, uno senza telefono, un doppione.
// Gli id dicono la fase (demo-lead-10 ... demo-lead-90): li usano le prove e le foto delle altre corsie.
// Azione e scadenza salvate sono quelle che la funzione unica si aspetta, con scadenze miste: scaduto, oggi, futuro.
const TOMMASO = "demo-tommaso";
type SchemaLead = {
  id: string; fase: string; azienda: string; settore: string; referente: string; telefono: string | null; email: string | null;
  fonte: "meta" | "manuale" | "foglio_andrea"; creatoFa: number; azione: string | null; scadenza: (creato: number) => number | null;
  extra?: Partial<Riga<typeof leads>>;
};

export function datiDemo(ora: number, hashDemo: string): DatiDemo {
  const d: DatiDemo = { users: [], settings: [], leads: [], calls: [], proposals: [], clients: [], automations: [], fees: [], invoices: [], companyProfiles: [], callAnalyses: [], activities: [], jobs: [], tasks: [], automationSteps: [] };
  // "demo" resta l'utente del login e fa Diego (prima chiamata, da 10 a 30); Tommaso fa preventivi e presentazioni (da 40 a 70).
  d.users.push({ id: "demo", username: "demo", name: "Diego", passwordHash: hashDemo, active: true, failedLogins: 0, createdAt: ora - 90 * GIORNO });
  d.users.push({ id: TOMMASO, username: "tommaso", name: "Tommaso", passwordHash: hashDemo, active: true, failedLogins: 0, createdAt: ora - 90 * GIORNO });
  d.settings.push({ key: "assegnazione", value: JSON.stringify({ primaChiamata: "demo", presentazione: TOMMASO, proposta: TOMMASO, via: { utente: null, fino: null } }), updatedBy: null, updatedAt: ora - 90 * GIORNO });

  const ORA_MS = 3_600_000;
  const domaniAlle = (giorni: number, h: number) => { const p = partiRoma(ora); return daRoma(p.anno, p.mese, p.giorno + giorni, h, 0); };
  const callConoscenza30 = domaniAlle(1, 10);
  const consulenza40 = ora - GIORNO - 2 * ORA_MS;
  const presentazione50 = domaniAlle(2, 15);
  const presentata60 = ora - 5 * GIORNO;
  const MEET = "https://meet.esempio.invalid/demo-demo-demo";

  const schemi: SchemaLead[] = [
    // 10: arrivato tre giorni fa e mai chiamato: la prima chiamata è scaduta da più di un giorno (rosso).
    { id: "demo-lead-10", fase: "da-chiamare-prima-volta", azienda: "Officina Bullonetti", settore: "Officina meccanica", referente: "Marco Rossi",
      telefono: "+39 000 1000001", email: "marco.rossi@esempio.invalid", fonte: "meta", creatoFa: 3 * GIORNO, azione: "Prima chiamata",
      scadenza: (c) => scadenzaLavorativa(c, 30, ORARIO_DEFAULT) },
    // 10 senza telefono: arrivato da pochi minuti dal modulo, solo email.
    { id: "demo-lead-senza-telefono", fase: "da-chiamare-prima-volta", azienda: "Casa Tegolina", settore: "Agenzia immobiliare", referente: "Giulia Bianchi",
      telefono: null, email: "giulia.bianchi@esempio.invalid", fonte: "manuale", creatoFa: 10 * 60_000, azione: "Prima chiamata",
      scadenza: (c) => scadenzaLavorativa(c, 30, ORARIO_DEFAULT) },
    // 20: un tentativo a vuoto ieri, si richiama oggi (arancione).
    { id: "demo-lead-20", fase: "da-richiamare", azienda: "Studio Partitadoppia", settore: "Studio commercialista", referente: "Luca Conti",
      telefono: "+39 000 1000020", email: "luca.conti@esempio.invalid", fonte: "meta", creatoFa: 2 * GIORNO, azione: "Richiamare",
      scadenza: () => ora - ORA_MS, extra: { attemptCount: 1, firstResponseAt: ora - GIORNO } },
    // Doppione: stesso telefono del lead in 20 (aperto), arrivato di nuovo da Meta un'ora fa.
    { id: "demo-lead-doppione", fase: "da-chiamare-prima-volta", azienda: "Studio Partitadoppia Srl", settore: "Studio commercialista", referente: "Luca Conti",
      telefono: "+39 000 1000020", email: "studio.partitadoppia@esempio.invalid", fonte: "meta", creatoFa: ORA_MS, azione: "Prima chiamata",
      scadenza: (c) => scadenzaLavorativa(c, 30, ORARIO_DEFAULT), extra: { duplicateOfId: "demo-lead-20" } },
    // 30: consulenza domani alle 10 con il link Meet (blu, futuro).
    { id: "demo-lead-30", fase: "appuntamento-confermato", azienda: "Elettro Impianti Voltolini", settore: "Impianti elettrici", referente: "Sara Ricci",
      telefono: "+39 000 1000030", email: "sara.ricci@esempio.invalid", fonte: "meta", creatoFa: 4 * GIORNO, azione: "Call di conoscenza",
      scadenza: () => callConoscenza30, extra: { appointmentAt: callConoscenza30, meetLink: MEET, firstResponseAt: ora - 3 * GIORNO } },
    // 40: consulenza fatta ieri, preventivo entro due giorni lavorativi (futuro).
    { id: "demo-lead-40", fase: "in-attesa-preventivo", azienda: "Trasporti Pacchettoni", settore: "Logistica e trasporti", referente: "Andrea Greco",
      telefono: "+39 000 1000040", email: "andrea.greco@esempio.invalid", fonte: "foglio_andrea", creatoFa: 8 * GIORNO, azione: "Preparare il preventivo",
      scadenza: () => giorniLavorativiDopo(consulenza40, 2, ORARIO_DEFAULT), extra: { firstResponseAt: ora - 7 * GIORNO } },
    // 50: preventivo pronto, presentazione dopodomani (blu, futuro).
    { id: "demo-lead-50", fase: "presentazione-confermata", azienda: "Studio Dentistico Molarini", settore: "Studio dentistico", referente: "Elena Bruno",
      telefono: "+39 000 1000050", email: "elena.bruno@esempio.invalid", fonte: "meta", creatoFa: 12 * GIORNO, azione: "Call di presentazione",
      scadenza: () => presentazione50, extra: { appointmentAt: presentazione50, meetLink: MEET, setupCents: 250_000, feeCents: 20_000, firstResponseAt: ora - 11 * GIORNO } },
    // 60: preventivo presentato cinque giorni fa, il richiamo per la decisione è scaduto da due giorni (rosso).
    { id: "demo-lead-60", fase: "in-attesa-decisione", azienda: "Immobiliare Mattonelli", settore: "Agenzia immobiliare", referente: "Paolo Gallo",
      telefono: "+39 000 1000060", email: "paolo.gallo@esempio.invalid", fonte: "manuale", creatoFa: 15 * GIORNO, azione: "Follow-up preventivo",
      scadenza: () => presentata60 + 3 * GIORNO, extra: { setupCents: 300_000, feeCents: 25_000, firstResponseAt: ora - 14 * GIORNO } },
    // 70: cliente da un mese, con automazione attiva e canone.
    { id: "demo-lead-70", fase: "chiuso", azienda: "Autofficina Pistonfino", settore: "Officina meccanica", referente: "Chiara Costa",
      telefono: "+39 000 1000070", email: "chiara.costa@esempio.invalid", fonte: "meta", creatoFa: 45 * GIORNO, azione: null, scadenza: () => null,
      extra: { setupCents: 200_000, feeCents: 20_000, wonStartAt: ora - 30 * GIORNO, firstResponseAt: ora - 44 * GIORNO } },
    // 80: troppo caro (motivo a codice del blocco 1).
    { id: "demo-lead-80", fase: "non-chiuso", azienda: "Spedizioni Nastrino", settore: "Logistica e trasporti", referente: "Davide Fontana",
      telefono: "+39 000 1000080", email: "davide.fontana@esempio.invalid", fonte: "meta", creatoFa: 20 * GIORNO, azione: null, scadenza: () => null,
      extra: { lostReason: "prezzo", setupCents: 250_000, feeCents: 30_000, firstResponseAt: ora - 19 * GIORNO } },
    // 90: un privato, non un'azienda in target.
    { id: "demo-lead-90", fase: "fake", azienda: "Francesca Moretti (privato)", settore: "Privato", referente: "Francesca Moretti",
      telefono: "+39 000 1000090", email: "francesca.moretti@esempio.invalid", fonte: "meta", creatoFa: 6 * GIORNO, azione: null, scadenza: () => null,
      extra: { lostReason: "fuori_target", firstResponseAt: ora - 6 * GIORNO + ORA_MS } },
  ];
  const DI_TOMMASO = ["in-attesa-preventivo", "presentazione-confermata", "in-attesa-decisione", "chiuso"];
  schemi.forEach((s, i) => {
    const creato = ora - s.creatoFa;
    const meta = s.fonte === "meta";
    d.leads.push({
      id: s.id, company: s.azienda, contactName: s.referente, email: s.email, emailNorm: normalizeEmail(s.email), phone: s.telefono, phoneNorm: normalizePhone(s.telefono),
      website: `https://${slug(s.azienda)}.esempio.invalid`, notes: s.settore, source: s.fonte,
      metaCampaign: meta ? CAMPAGNE[i % 3] : null, metaAd: meta ? `Inserzione ${(i % 5) + 1}` : null,
      stageId: s.fase, stageChangedAt: creato, ownerId: DI_TOMMASO.includes(s.fase) ? TOMMASO : "demo",
      nextAction: s.azione, nextActionAt: s.scadenza(creato),
      score: (["verde", "giallo", "grigio"] as const)[i % 3],
      createdBy: meta ? null : "demo", createdAt: creato, updatedAt: creato,
      ...s.extra,
    });
    d.activities.push({ id: `${s.id}-a1`, leadId: s.id, type: "creazione", body: `Lead creato (${s.fonte})`, authorId: null, createdAt: creato });
  });
  const ultimo = (id: string) => d.leads.find((l) => l.id === id)!;
  const fase = (id: string, a: string, at: number) => { ultimo(id).stageChangedAt = at; ultimo(id).updatedAt = at; d.activities.push({ id: `${id}-f${d.activities.length}`, leadId: id, type: "cambio_fase", body: a, authorId: "demo", createdAt: at }); };

  // 20: storico del primo tentativo.
  d.activities.push({ id: "demo-lead-20-a2", leadId: "demo-lead-20", type: "esito", body: "Non risponde (tentativo 1 di 5)", authorId: "demo", createdAt: ora - GIORNO });
  fase("demo-lead-20", 'Da "Nuovo, da chiamare" a "Da richiamare"', ora - GIORNO);
  d.activities.push({ id: "demo-lead-doppione-a2", leadId: "demo-lead-doppione", type: "nota", body: "Possibile doppione di Studio Partitadoppia (stesso telefono)", authorId: null, createdAt: ora - ORA_MS });

  // 30: consulenza in calendario.
  d.calls.push({ id: "demo-lead-30-c1", leadId: "demo-lead-30", kind: "conoscenza", scheduledAt: callConoscenza30, meetLink: MEET, createdBy: "demo", createdAt: ora - 3 * GIORNO, updatedAt: ora - 3 * GIORNO });
  fase("demo-lead-30", 'Da "Nuovo, da chiamare" a "Consulenza fissata"', ora - 3 * GIORNO);
  // Le call di conoscenza fatte (40, 50, 60, 70, 80): una ciascuno, nel passato.
  const conoscenzaFatta = (id: string, quando: number, coachSi = false) => {
    d.calls.push({ id: `${id}-c1`, leadId: id, kind: "conoscenza", scheduledAt: quando, meetLink: MEET, outcome: "fatta", outcomeAt: quando, createdBy: "demo", createdAt: quando - 2 * GIORNO, updatedAt: quando });
    if (coachSi) d.callAnalyses.push({ id: `${id}-coach`, leadId: id, callId: `${id}-c1`, status: "ready", transcript: "Trascrizione finta dello spazio demo.", result: JSON.stringify(coach(quando + 3 * GIORNO)), model: "demo", createdAt: quando });
  };
  conoscenzaFatta("demo-lead-40", consulenza40, true);
  fase("demo-lead-40", 'Da "Consulenza fissata" a "In attesa preventivo"', consulenza40);
  conoscenzaFatta("demo-lead-50", ora - 9 * GIORNO, true);
  conoscenzaFatta("demo-lead-60", ora - 12 * GIORNO);
  conoscenzaFatta("demo-lead-70", ora - 40 * GIORNO);
  conoscenzaFatta("demo-lead-80", ora - 17 * GIORNO);

  // Proposte: 50 registrata con la presentazione in calendario, 60 presentata, 70 accettata, 80 rifiutata.
  const proposta = (id: string, n: number, status: (typeof PROPOSAL_STATUSES)[number], creata: number, presentata: number | null, decisa: number | null) => {
    const l = ultimo(id);
    d.proposals.push({
      id: `${id}-p1`, leadId: id, number: `DEMO-2026-${String(n).padStart(3, "0")}`, company: l.company, option: "standard",
      setupCents: l.setupCents ?? 250_000, feeCents: l.feeCents ?? 20_000, status, sentAt: creata, presentedAt: presentata, decidedAt: decisa,
      registeredVia: "manuale", createdAt: creata, updatedAt: decisa ?? presentata ?? creata,
    });
  };
  proposta("demo-lead-50", 50, "registrata", ora - 2 * GIORNO, null, null);
  d.calls.push({ id: "demo-lead-50-c2", leadId: "demo-lead-50", kind: "presentazione", scheduledAt: presentazione50, meetLink: MEET, createdBy: TOMMASO, createdAt: ora - 2 * GIORNO, updatedAt: ora - 2 * GIORNO });
  fase("demo-lead-50", 'Da "In attesa preventivo" a "Presentazione fissata"', ora - 2 * GIORNO);
  proposta("demo-lead-60", 60, "presentata", ora - 7 * GIORNO, presentata60, null);
  d.calls.push({ id: "demo-lead-60-c2", leadId: "demo-lead-60", kind: "presentazione", scheduledAt: presentata60, meetLink: MEET, outcome: "fatta", outcomeAt: presentata60, createdBy: TOMMASO, createdAt: ora - 7 * GIORNO, updatedAt: presentata60 });
  fase("demo-lead-60", 'Da "Presentazione fissata" a "In attesa decisione"', presentata60);
  proposta("demo-lead-70", 70, "accettata", ora - 36 * GIORNO, ora - 34 * GIORNO, ora - 31 * GIORNO);
  fase("demo-lead-70", 'Da "In attesa decisione" a "Cliente"', ora - 31 * GIORNO);
  proposta("demo-lead-80", 80, "rifiutata", ora - 15 * GIORNO, ora - 13 * GIORNO, ora - 10 * GIORNO);
  fase("demo-lead-80", 'Da "In attesa decisione" a "Non interessato"', ora - 10 * GIORNO);
  d.activities.push({ id: "demo-lead-80-a9", leadId: "demo-lead-80", type: "nota", body: "Motivo: Troppo caro", authorId: TOMMASO, createdAt: ora - 10 * GIORNO });
  fase("demo-lead-90", 'Da "Nuovo, da chiamare" a "Non profilato"', ora - 5 * GIORNO);

  // Scheda azienda (ricerca) per i lead in 30 e 40.
  for (const id of ["demo-lead-30", "demo-lead-40"]) {
    const l = ultimo(id);
    d.companyProfiles.push({
      id: `${id}-scheda`, leadId: id, version: 1, status: "ready", content: SCHEDA(l.company, l.notes ?? ""), sources: "[]", model: "demo",
      classification: JSON.stringify({ azienda: true, fake: false, motivo: "Azienda con sito e settore chiaro (dati finti)" }),
      createdAt: l.createdAt + 600_000, updatedAt: l.createdAt + 600_000,
    });
  }

  // Il cliente del lead in 70: un'automazione attiva, un canone attivo, le fatture, il lavoro tipo con le sue task.
  const l70 = ultimo("demo-lead-70");
  const cid = "demo-cliente-1";
  const [nomeAuto, famiglia] = AUTOMAZIONI_SETTORE[l70.notes ?? ""][0];
  d.clients.push({ id: cid, name: l70.company, sector: l70.notes ?? null, city: "Pisa", scope: "acceleriamo", originLeadId: l70.id, createdAt: ora - 30 * GIORNO });
  d.automations.push({ id: "demo-auto-1", clientId: cid, name: nomeAuto, family: famiglia, status: "attiva", runsOn: "Cloudflare", stack: "Worker, D1", activatedAt: ora - 20 * GIORNO, createdAt: ora - 30 * GIORNO, updatedAt: ora - 20 * GIORNO });
  d.fees.push({ id: "demo-canone-1", clientId: cid, automationId: "demo-auto-1", amountCents: l70.feeCents ?? 20_000, billingDay: 1, status: "attivo", startAt: ora - 20 * GIORNO });
  d.invoices.push({ id: "demo-fattura-1a", clientId: cid, kind: "acconto", number: "D101", amountCents: Math.round((l70.setupCents ?? 200_000) / 2), issuedAt: ora - 30 * GIORNO, dueAt: ora - 15 * GIORNO, paidAt: ora - 16 * GIORNO });
  d.invoices.push({ id: "demo-fattura-1c", clientId: cid, feeId: "demo-canone-1", kind: "canone", number: "D102", amountCents: l70.feeCents ?? 20_000, period: new Date(ora).toISOString().slice(0, 7), issuedAt: ora - 10 * GIORNO, dueAt: ora + 20 * GIORNO, paidAt: null });
  // Lavoro tipo dal primo del mese scorso (ricorrenti già nate questo mese), task di Tommaso così Oggi e Lavori non restano vuoti.
  const p = partiRoma(ora);
  const avvio = daRoma(p.mese === 1 ? p.anno - 1 : p.anno, p.mese === 1 ? 12 : p.mese - 1, 1);
  const daMese = primoMeseRicorrenti(avvio);
  d.jobs.push({ id: "demo-lavoro-1", clientId: cid, templateId: MODELLO_DEMO, name: "Automazione su misura", startAt: avvio, automationId: "demo-auto-1", feeCents: l70.feeCents ?? 20_000, recurringFromMonth: daMese, status: "attivo", createdAt: avvio });
  UNA_TANTUM_DEMO.forEach(([mid, titolo, giorni], n) => {
    const dueAt = scadenzaUnaTantum(avvio, giorni);
    const fatta = dueAt < ora - 2 * GIORNO;
    d.tasks.push({ id: `demo-task-1-${n + 1}`, title: titolo, clientId: cid, jobId: "demo-lavoro-1", templateTaskId: mid, assigneeId: "demo", dueAt, doneAt: fatta ? dueAt : null, doneBy: fatta ? "demo" : null, createdAt: avvio });
  });
  const mese = meseRoma(ora);
  if (mese >= daMese) {
    RICORRENTI_DEMO.forEach(([mid, titolo], n) => {
      d.tasks.push({ id: `demo-task-1-r${n + 1}`, title: titolo, clientId: cid, jobId: "demo-lavoro-1", templateTaskId: mid, month: mese, assigneeId: "demo", dueAt: scadenzaRicorrente(mese, 1), createdAt: scadenzaRicorrente(mese, 1) });
    });
  }
  PASSAGGI_DEMO.forEach(([titolo, riassunto, ramo, icona], n) => {
    d.automationSteps.push({ id: `demo-passo-${n + 1}`, automationId: "demo-auto-1", position: n + 1, title: titolo, summary: riassunto, branch: ramo, icon: icona, confirmed: n < 2 });
  });
  return d;
}

// Ordine delle tabelle: chi è citato prima di chi cita (le chiavi esterne di D1 sono attive).
const ORDINE = [
  ["users", users], ["settings", settings], ["leads", leads], ["activities", activities], ["calls", calls], ["proposals", proposals], ["companyProfiles", companyProfiles],
  ["callAnalyses", callAnalyses], ["clients", clients], ["automations", automations], ["fees", fees], ["invoices", invoices],
  ["jobs", jobs], ["tasks", tasks], ["automationSteps", automationSteps],
] as const satisfies readonly (readonly [keyof DatiDemo, SQLiteTable])[];
// Tabelle svuotate al ripristino oltre a quelle seminate (stati, avvisi, registri).
const SOLO_DA_SVUOTARE = ["documents", "audit_log", "notifications", "ai_jobs", "claude_usage", "campaign_spend", "weekly_reviews", "push_subscriptions", "costs", "sessions", "hook_log", "integration_status"];

const letterale = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  const s = typeof v === "string" ? v : JSON.stringify(v);
  // Una riga per istruzione: gli a capo diventano char(10).
  return `'${s.replace(/'/g, "''").replace(/\n/g, "' || char(10) || '")}'`;
};

// Impostazioni, regole, modelli e fasi: un visitatore della demo può cambiarli, il ripristino li rimette come
// dopo le migrazioni. Si svuotano (dopo i lead, che citano le fasi) e si rieseguono, in ordine, le INSERT e le
// UPDATE delle migrazioni su queste tabelle. Le impostazioni non hanno righe di partenza: vuote valgono i default.
// Anche il lavoro tipo predefinito con le sue task torna come dopo la migrazione 0008_dati_lavori.
export const TABELLE_BASE = ["settings", "stage_rules", "message_templates", "stages", "job_templates", "job_template_tasks"] as const;
const SU_BASE = new RegExp(`^\\s*(INSERT INTO|UPDATE|DELETE FROM)\\s+[\`"]?(${TABELLE_BASE.join("|")})[\`"]?[\\s(]`, "i");

// Una riga sola per istruzione: fuori dalle stringhe gli a capo diventano spazi, dentro diventano char(10)
// (il modello della conferma ha un a capo nel testo).
function suUnaRiga(q: string): string {
  let out = "";
  let inStringa = false;
  for (const ch of q) {
    if (ch === "'") inStringa = !inStringa; // l'apice doppio '' chiude e riapre: il conto resta giusto
    if (ch === "\n") out += inStringa ? "' || char(10) || '" : " ";
    else if (ch !== "\r") out += ch;
  }
  return out;
}

// Le istruzioni delle migrazioni (in ordine, comprese le DELETE della 0016 che toglie tre fasi, già divise ai "statement-breakpoint") che scrivono le tabelle di base.
const senzaCommenti = (q: string) => q.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim();
export const istruzioniBase = (istruzioni: string[]): string[] =>
  istruzioni.map(senzaCommenti).filter((q) => SU_BASE.test(q)).map((q) => `${suUnaRiga(q.replace(/;\s*$/, ""))};`);

export function sqlDemo(d: DatiDemo, base: string[] = []): string[] {
  const svuota = [...SOLO_DA_SVUOTARE, ...[...ORDINE].reverse().map(([, t]) => getTableConfig(t).name), ...(base.length ? TABELLE_BASE : [])];
  const out = [...svuota.map((t) => `DELETE FROM ${t};`), ...base];
  for (const [chiave, tabella] of ORDINE) {
    const colonne = getTableColumns(tabella) as Record<string, { name: string }>;
    const nome = getTableConfig(tabella).name;
    for (const riga of d[chiave] as Record<string, unknown>[]) {
      const campi = Object.keys(riga).filter((k) => riga[k] !== undefined);
      out.push(`INSERT INTO ${nome} (${campi.map((k) => colonne[k].name).join(", ")}) VALUES (${campi.map((k) => letterale(riga[k])).join(", ")});`);
    }
  }
  return out;
}
