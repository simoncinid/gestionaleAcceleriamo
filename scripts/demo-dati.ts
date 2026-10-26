// Dati finti dello spazio demo (spec 12). Funzione pura: niente rete, niente file, niente orologio.
// Aziende, referenti e contatti sono inventati: email e siti solo su esempio.invalid (dominio riservato, non apre
// pagine di terzi), telefoni con prefisso +39 000.
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import type { CoachSalvato } from "../worker/claude/coach";
import {
  activities, automationSteps, automations, callAnalyses, calls, clients, companyProfiles, fees, invoices, jobs, leads, proposals, tasks, users,
} from "../worker/db/schema";
import { primoMeseRicorrenti, scadenzaRicorrente, scadenzaUnaTantum } from "../worker/lavori/calcoli";
import { daRoma, meseRoma, partiRoma } from "../worker/lib/roma";

type Riga<T extends SQLiteTable> = T["$inferInsert"];
export type DatiDemo = {
  users: Riga<typeof users>[]; leads: Riga<typeof leads>[]; calls: Riga<typeof calls>[]; proposals: Riga<typeof proposals>[];
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
const NOMI = ["Marco", "Giulia", "Luca", "Sara", "Andrea", "Elena", "Paolo", "Chiara", "Davide", "Francesca"];
const COGNOMI = ["Rossi", "Bianchi", "Conti", "Ricci", "Greco", "Bruno", "Gallo", "Costa", "Fontana", "Moretti"];
// Distribuzione sulle fasi della 1A (drizzle/0001): 40 lead, quasi tutti aperti.
const FASI: [string, number][] = [
  ["da-chiamare-prima-volta", 6], ["da-richiamare", 4], ["da-richiamare", 6], ["appuntamento-confermato", 4],
  ["presentazione-confermata", 3], ["in-attesa-preventivo", 3], ["in-attesa-decisione", 4], ["in-attesa-decisione", 2],
  ["chiuso", 3], ["non-chiuso", 3], ["fake", 2],
];
const CHIUSE = ["chiuso", "non-chiuso", "fake"];
const CON_PREZZO = ["in-attesa-preventivo", "in-attesa-decisione", "chiuso"];
const CON_CALL = ["appuntamento-confermato", "presentazione-confermata", "in-attesa-preventivo", "in-attesa-decisione", "chiuso", "non-chiuso"];
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

export function datiDemo(ora: number, hashDemo: string): DatiDemo {
  const d: DatiDemo = { users: [], leads: [], calls: [], proposals: [], clients: [], automations: [], fees: [], invoices: [], companyProfiles: [], callAnalyses: [], activities: [], jobs: [], tasks: [], automationSteps: [] };
  d.users.push({ id: "demo", username: "demo", name: "Utente demo", passwordHash: hashDemo, active: true, failedLogins: 0, createdAt: ora - 90 * GIORNO });
  const aziende = SETTORI.flatMap(([settore, nomi]) => nomi.map((n) => ({ settore, nome: n }))).slice(0, 40);
  const fasi = FASI.flatMap(([id, n]) => Array.from({ length: n }, () => id));
  aziende.forEach((a, i) => {
    const id = `demo-lead-${String(i + 1).padStart(2, "0")}`;
    const fase = fasi[i];
    const creato = ora - ((i % 20) + 1) * GIORNO - ((i * 37) % 600) * 60_000;
    const referente = `${NOMI[i % NOMI.length]} ${COGNOMI[(i * 3) % COGNOMI.length]}`;
    const email = i % 7 === 6 ? null : `${slug(referente)}.${i + 1}@esempio.invalid`;
    const telefono = `+39 000 ${String(1_000_000 + i * 7919).slice(0, 7)}`;
    const meta = i % 4 !== 3;
    const setup = 200_000 + (i % 3) * 50_000;
    const canone = 15_000 + (i % 4) * 5_000;
    const chiusa = CHIUSE.includes(fase);
    const conPrezzo = CON_PREZZO.includes(fase);
    d.leads.push({
      id, company: a.nome, contactName: referente, email, emailNorm: email, phone: telefono, phoneNorm: telefono.replace(/\s/g, ""),
      website: `https://${slug(a.nome)}.esempio.invalid`, notes: a.settore, source: meta ? "meta" : i % 2 ? "foglio_andrea" : "manuale",
      metaCampaign: meta ? CAMPAGNE[i % 3] : null, metaAd: meta ? `Inserzione ${(i % 5) + 1}` : null,
      stageId: fase, stageChangedAt: creato + GIORNO, ownerId: "demo",
      nextAction: chiusa ? null : "Richiamare",
      nextActionAt: chiusa ? null : ora + ((i % 5) - 2) * 3_600_000,
      setupCents: conPrezzo ? setup : null, feeCents: conPrezzo ? canone : null,
      score: (["verde", "giallo", "grigio"] as const)[i % 3],
      lostReason: fase === "non-chiuso" ? "budget" : fase === "fake" ? "fuori_target" : null,
      firstResponseAt: fase === "da-chiamare-prima-volta" ? null : creato + 40 * 60_000,
      wonStartAt: fase === "chiuso" ? ora - 30 * GIORNO : null,
      createdBy: meta ? null : "demo", createdAt: creato, updatedAt: creato + GIORNO,
    });
    d.activities.push({ id: `${id}-a1`, leadId: id, type: "creazione", body: "Lead creato (dati finti)", authorId: null, createdAt: creato });
    if (CON_CALL.includes(fase)) {
      const fatta = fase !== "appuntamento-confermato";
      const quando = fatta ? creato + 2 * GIORNO : ora + ((i % 3) + 1) * GIORNO;
      const callId = `${id}-c1`;
      d.calls.push({ id: callId, leadId: id, kind: "conoscenza", scheduledAt: quando, meetLink: "https://meet.esempio.invalid/demo-demo-demo", outcome: fatta ? "fatta" : null, outcomeAt: fatta ? quando : null, createdBy: "demo", createdAt: creato + GIORNO, updatedAt: quando });
      if (!fatta) d.leads[d.leads.length - 1].appointmentAt = quando;
      if (fatta && d.callAnalyses.length < 3) {
        d.callAnalyses.push({ id: `${id}-coach`, leadId: id, callId, status: "ready", transcript: "Trascrizione finta dello spazio demo.", result: JSON.stringify(coach(quando + 3 * GIORNO)), model: "demo", createdAt: quando });
      }
    }
    if (["in-attesa-decisione", "chiuso", "non-chiuso"].includes(fase)) {
      const stato = fase === "chiuso" ? "accettata" : fase === "non-chiuso" ? "rifiutata" : i % 2 ? "presentata" : "registrata";
      const proprieta = i % 5 === 0;
      d.proposals.push({
        id: `${id}-p1`, leadId: id, number: `DEMO-2026-${String(i + 1).padStart(3, "0")}`, company: a.nome, option: proprieta ? "proprieta" : "standard",
        setupCents: setup, feeCents: proprieta ? 0 : canone, status: stato, sentAt: creato + 4 * GIORNO,
        presentedAt: stato === "registrata" ? null : creato + 5 * GIORNO, decidedAt: ["accettata", "rifiutata"].includes(stato) ? creato + 8 * GIORNO : null,
        registeredVia: "manuale", createdAt: creato + 4 * GIORNO, updatedAt: creato + 5 * GIORNO,
      });
    }
    if (i < 6 || (i >= 20 && i < 22)) {
      d.companyProfiles.push({
        id: `${id}-scheda`, leadId: id, version: 1, status: "ready", content: SCHEDA(a.nome, a.settore), sources: "[]", model: "demo",
        classification: JSON.stringify({ azienda: true, fake: false, motivo: "Azienda con sito e settore chiaro (dati finti)" }),
        createdAt: creato + 600_000, updatedAt: creato + 600_000,
      });
    }
  });
  // Tre clienti dai lead chiusi; le automazioni non portano il nome del cliente (anonime anche nel Pannello).
  const usate = new Map<string, number>();
  d.leads.filter((l) => l.stageId === "chiuso").forEach((l, k) => {
    const cid = `demo-cliente-${k + 1}`;
    const elenco = AUTOMAZIONI_SETTORE[l.notes ?? ""] ?? AUTOMAZIONI_SETTORE["Logistica e trasporti"];
    const n = usate.get(l.notes ?? "") ?? 0;
    usate.set(l.notes ?? "", n + 1);
    const [nomeAuto, famiglia] = elenco[n % elenco.length];
    d.clients.push({ id: cid, name: l.company, sector: l.notes ?? null, city: "Pisa", scope: "acceleriamo", originLeadId: l.id, createdAt: ora - 30 * GIORNO });
    d.automations.push({ id: `demo-auto-${k + 1}`, clientId: cid, name: nomeAuto, family: famiglia, status: k === 2 ? "in_costruzione" : "attiva", runsOn: "Cloudflare", stack: "Worker, D1", activatedAt: k === 2 ? null : ora - 20 * GIORNO, createdAt: ora - 30 * GIORNO, updatedAt: ora - 20 * GIORNO });
    const fee = `demo-canone-${k + 1}`;
    d.fees.push({ id: fee, clientId: cid, automationId: `demo-auto-${k + 1}`, amountCents: l.feeCents ?? 20_000, billingDay: 1, status: k === 2 ? "in_attesa" : "attivo", startAt: k === 2 ? null : ora - 20 * GIORNO });
    d.invoices.push({ id: `demo-fattura-${k + 1}a`, clientId: cid, kind: "acconto", number: `D${k + 1}01`, amountCents: Math.round((l.setupCents ?? 200_000) / 2), issuedAt: ora - 30 * GIORNO, dueAt: ora - 15 * GIORNO, paidAt: k === 1 ? null : ora - 16 * GIORNO });
    if (k !== 2) d.invoices.push({ id: `demo-fattura-${k + 1}c`, clientId: cid, feeId: fee, kind: "canone", number: `D${k + 1}02`, amountCents: l.feeCents ?? 20_000, period: new Date(ora).toISOString().slice(0, 7), issuedAt: ora - 10 * GIORNO, dueAt: ora + 20 * GIORNO, paidAt: null });
    // Lavori (dal ramo dei lavori): i due clienti attivi hanno il lavoro tipo predefinito con le sue task, assegnate
    // all'utente demo così Oggi e Lavori non restano vuoti. Il primo parte il primo del mese scorso (ricorrenti già
    // nate questo mese), il secondo 20 giorni fa (ricorrenti dal mese dopo l'avvio).
    if (k !== 2) {
      const p = partiRoma(ora);
      const avvio = k === 0 ? daRoma(p.mese === 1 ? p.anno - 1 : p.anno, p.mese === 1 ? 12 : p.mese - 1, 1) : ora - 20 * GIORNO;
      const jobId = `demo-lavoro-${k + 1}`;
      const daMese = primoMeseRicorrenti(avvio);
      d.jobs.push({ id: jobId, clientId: cid, templateId: MODELLO_DEMO, name: "Automazione su misura", startAt: avvio, automationId: `demo-auto-${k + 1}`, feeCents: l.feeCents ?? 20_000, recurringFromMonth: daMese, status: "attivo", createdAt: avvio });
      UNA_TANTUM_DEMO.forEach(([mid, titolo, giorni], n) => {
        const dueAt = scadenzaUnaTantum(avvio, giorni);
        const fatta = dueAt < ora - 2 * GIORNO;
        d.tasks.push({ id: `demo-task-${k + 1}-${n + 1}`, title: titolo, clientId: cid, jobId, templateTaskId: mid, assigneeId: "demo", dueAt, doneAt: fatta ? dueAt : null, doneBy: fatta ? "demo" : null, createdAt: avvio });
      });
      const mese = meseRoma(ora);
      if (mese >= daMese) {
        RICORRENTI_DEMO.forEach(([mid, titolo], n) => {
          d.tasks.push({ id: `demo-task-${k + 1}-r${n + 1}`, title: titolo, clientId: cid, jobId, templateTaskId: mid, month: mese, assigneeId: "demo", dueAt: scadenzaRicorrente(mese, 1), createdAt: scadenzaRicorrente(mese, 1) });
        });
      }
    }
    if (k === 0) {
      PASSAGGI_DEMO.forEach(([titolo, riassunto, ramo, icona], n) => {
        d.automationSteps.push({ id: `demo-passo-${n + 1}`, automationId: "demo-auto-1", position: n + 1, title: titolo, summary: riassunto, branch: ramo, icon: icona, confirmed: n < 2 });
      });
    }
  });
  return d;
}

// Ordine delle tabelle: chi è citato prima di chi cita (le chiavi esterne di D1 sono attive).
const ORDINE = [
  ["users", users], ["leads", leads], ["activities", activities], ["calls", calls], ["proposals", proposals], ["companyProfiles", companyProfiles],
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
