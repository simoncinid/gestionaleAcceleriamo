import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { getDb, type Db } from "../db/client";
import { activities, calls, leads, mailLette, stages } from "../db/schema";
import type { Env } from "../env";
import { avvisa } from "../avvisi/service";
import { contestoRegole } from "../impostazioni/service";
import { createLead, findDuplicate } from "../leads/service";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { partiRoma } from "../lib/roma";
import { accorcia, normalizzaAzienda } from "../lib/testo";
import { passiProposta } from "../regole/applica";
import { catenaLeadNuovo } from "../regole/catena";
import { propostaEvento } from "../regole/motore";
import { leggiInvito, linkMeet, type Invito, type Partecipante } from "./ics";
import { leggiRichiestaSito } from "./modulo";

// Una mail come la manda il lettore (scripts/posta/leggi_posta.py): già decodificata, solo testo.
export const mailSchema = z.object({
  messageId: z.string().trim().min(3).max(500),
  data: z.number().int(),
  da: z.object({ email: z.string().trim().toLowerCase().max(320), nome: z.string().max(300).nullable().optional() }),
  rispondiA: z.string().trim().toLowerCase().max(320).nullable().optional(),
  oggetto: z.string().max(1000).default(""),
  testo: z.string().max(40_000).default(""),
  calendario: z.string().max(100_000).nullable().optional(),
}).strict();
export type Mail = z.infer<typeof mailSchema>;

export type Esito = { tipo: "invito" | "modulo" | "risposta" | "altro"; esito: string; leadId?: string | null };

// Indirizzi nostri e del calendario: non sono mai un lead.
const daNoi = (email: string) => /@acceleriamo\.it$/i.test(email) || /@(resource|group)\.calendar\.google\.com$/i.test(email) || /calendar-notification@google\.com$/i.test(email);

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const quando = (ms: number) => {
  const p = partiRoma(ms);
  return `${GIORNI[p.settimana]} ${p.giorno}/${p.mese} alle ${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`;
};

// Fasi in cui la prossima call è la presentazione del preventivo.
const FASI_PRESENTAZIONE = ["in-attesa-preventivo", "presentazione-confermata", "in-attesa-decisione"];

export async function smistaMail(env: Env, m: Mail, now: number): Promise<Esito & { nuova: boolean }> {
  const db = getDb(env.DB);
  const gia = await db.select().from(mailLette).where(eq(mailLette.messageId, m.messageId)).get();
  if (gia) return { tipo: gia.tipo, esito: gia.esito, leadId: gia.leadId, nuova: false };
  const r = await scegli(env, db, m, now);
  await db.insert(mailLette).values({ messageId: m.messageId, at: now, tipo: r.tipo, esito: r.esito, leadId: r.leadId ?? null }).onConflictDoNothing();
  return { ...r, nuova: true };
}

async function scegli(env: Env, db: Db, m: Mail, now: number): Promise<Esito> {
  if (m.calendario) return invito(db, m, now);
  const richiesta = leggiRichiestaSito(m.testo);
  if (richiesta) return modulo(env, db, m, richiesta, now);
  if (!daNoi(m.da.email)) {
    const lead = await leadDaEmail(db, [m.da.email]);
    if (lead.length === 1) return risposta(db, m, lead[0], now);
  }
  return { tipo: "altro", esito: "ignorata" };
}

// Lead aperti o chiusi, non cestinati, con quell'email. Un doppione segnato cede il posto all'originale.
async function leadDaEmail(db: Db, email: string[]): Promise<string[]> {
  const norm = [...new Set(email.map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e)))];
  if (!norm.length) return [];
  const righe = await db.select({ id: leads.id, doppione: leads.duplicateOfId }).from(leads)
    .where(and(isNull(leads.deletedAt), inArray(leads.emailNorm, norm)));
  const originali = righe.filter((r) => !r.doppione || !righe.some((x) => x.id === r.doppione));
  return [...new Set(originali.map((r) => r.id))];
}

// --- Inviti di Google Calendar ---

async function leadDaNomi(db: Db, persone: Partecipante[], titolo: string): Promise<string[]> {
  const nomi = new Set(persone.map((p) => normalizzaAzienda(p.nome)).filter((n) => n.length >= 5));
  const titoloN = ` ${normalizzaAzienda(titolo)} `;
  const tutti = await db.select({ id: leads.id, company: leads.company, contactName: leads.contactName }).from(leads).where(isNull(leads.deletedAt));
  const trovati = tutti.filter((l) => {
    const azienda = normalizzaAzienda(l.company);
    const referente = normalizzaAzienda(l.contactName);
    return (referente.length >= 5 && nomi.has(referente)) || (azienda.length >= 4 && titoloN.includes(` ${azienda} `));
  });
  return [...new Set(trovati.map((l) => l.id))];
}

async function segnala(db: Db, m: Mail, inv: Invito | null, motivo: string, now: number): Promise<Esito> {
  const chi = inv ? [inv.organizzatore, ...inv.partecipanti].filter((p): p is Partecipante => Boolean(p) && !daNoi(p!.email)).map((p) => p.nome ? `${p.nome} <${p.email}>` : p.email) : [];
  const testo = [inv ? `${quando(inv.inizio)}${inv.durataMin ? `, ${inv.durataMin} minuti` : ""}` : null, chi.length ? `Partecipanti: ${chi.join(", ")}` : null, motivo]
    .filter(Boolean).join(". ");
  await avvisa(db, { evento: "mail_da_abbinare", entityId: `mail:${m.messageId}`, titolo: `Invito Meet senza lead: ${accorcia(inv?.titolo || m.oggetto || "senza titolo", 80)}`, testo, href: "/commerciale/call" }, now);
  return { tipo: "invito", esito: "da abbinare" };
}

async function invito(db: Db, m: Mail, now: number): Promise<Esito> {
  const inv = leggiInvito(m.calendario ?? "");
  if (!inv) return segnala(db, m, null, "Invito senza data o senza codice dell'evento", now);
  const link = inv.link ?? linkMeet(m.testo);
  const esterni = [inv.organizzatore, ...inv.partecipanti].filter((p): p is Partecipante => Boolean(p) && !daNoi(p!.email));

  // La call già legata a questo evento (anche un invito partito dal gestionale: lì l'UID è l'id della call).
  const legata = await db.select().from(calls).where(and(isNull(calls.deletedAt), or(eq(calls.icsUid, inv.uid), eq(calls.id, inv.uid)))).get();
  let leadId: string | null = legata?.leadId ?? null;
  if (!leadId) {
    let trovati = await leadDaEmail(db, esterni.map((p) => p.email));
    if (!trovati.length) trovati = await leadDaNomi(db, esterni, inv.titolo);
    if (trovati.length !== 1) return segnala(db, m, inv, trovati.length ? "Più lead possibili: va scelto a mano" : "Nessun lead con queste email o questi nomi", now);
    leadId = trovati[0];
  }
  if (legata && legata.icsSequence != null && inv.versione < legata.icsSequence) return { tipo: "invito", esito: "versione vecchia", leadId };

  if (inv.metodo === "CANCEL") {
    if (legata) await db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "call", body: `Invito annullato su Google Calendar: la call di ${legata.kind} di ${quando(legata.scheduledAt)} va riprogrammata`, authorId: null, createdAt: now, callId: legata.id });
    return { tipo: "invito", esito: legata ? "annullata" : "annullata senza call", leadId };
  }

  const lead = await db.select({ stageId: leads.stageId, kind: stages.kind }).from(leads).innerJoin(stages, eq(stages.id, leads.stageId)).where(eq(leads.id, leadId)).get();
  const aperta = lead?.kind === "open";
  // Senza una call legata si usa quella ancora da fare del lead più vicina all'invito, se c'è.
  let call = legata;
  if (!call) {
    const daFare = await db.select().from(calls).where(and(eq(calls.leadId, leadId), isNull(calls.deletedAt), isNull(calls.outcome), isNull(calls.icsUid)));
    call = daFare.sort((a, b) => Math.abs(a.scheduledAt - inv.inizio) - Math.abs(b.scheduledAt - inv.inizio))[0];
  }
  const passi: BatchItem<"sqlite">[] = [];
  const ctx = await contestoRegole(db, now);
  if (call) {
    if (call.outcome === "fatta" || call.outcome === "saltata") return { tipo: "invito", esito: "call già chiusa", leadId };
    const spostata = call.scheduledAt !== inv.inizio;
    passi.push(db.update(calls).set({ scheduledAt: inv.inizio, durationMin: inv.durataMin, meetLink: link ?? call.meetLink, icsUid: inv.uid, icsSequence: inv.versione, outcome: null, outcomeAt: null, updatedAt: now }).where(eq(calls.id, call.id)));
    if (spostata) {
      passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "call", body: `Call di ${call.kind} spostata dall'invito di Google: ${quando(inv.inizio)}`, authorId: null, createdAt: now, callId: call.id }));
      if (aperta) passi.push(...(await passiProposta(db, leadId, propostaEvento({ tipo: "call_fissata", kind: call.kind, scheduledAt: inv.inizio }, ctx), null, now)));
    }
    await db.batch(passi as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    return { tipo: "invito", esito: spostata ? "call spostata" : "call aggiornata", leadId };
  }
  const conoscenzaFatta = await db.select({ id: calls.id }).from(calls).where(and(eq(calls.leadId, leadId), eq(calls.kind, "conoscenza"), eq(calls.outcome, "fatta"), isNull(calls.deletedAt))).get();
  const kind = conoscenzaFatta || FASI_PRESENTAZIONE.includes(lead?.stageId ?? "") ? "presentazione" : "conoscenza";
  const id = crypto.randomUUID();
  passi.push(db.insert(calls).values({ id, leadId, kind, scheduledAt: inv.inizio, durationMin: inv.durataMin, meetLink: link, icsUid: inv.uid, icsSequence: inv.versione, createdBy: null, createdAt: now, updatedAt: now }));
  passi.push(db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "call", body: `Call di ${kind} fissata dall'invito di Google: ${quando(inv.inizio)}`, authorId: null, createdAt: now, callId: id }));
  if (aperta) passi.push(...(await passiProposta(db, leadId, propostaEvento({ tipo: "call_fissata", kind, scheduledAt: inv.inizio }, ctx), null, now)));
  await db.batch(passi as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  return { tipo: "invito", esito: "call creata", leadId };
}

// --- Richieste dal modulo del sito ---

async function modulo(env: Env, db: Db, m: Mail, r: NonNullable<ReturnType<typeof leggiRichiestaSito>>, now: number): Promise<Esito> {
  // Senza email nel modulo vale l'indirizzo di risposta, se non è nostro.
  const email = r.email ?? (m.rispondiA && !daNoi(m.rispondiA) ? m.rispondiA : null);
  const dettagli = [r.ruolo ? `Ruolo: ${r.ruolo}` : null, ...r.risposte.map((x) => `${x.etichetta}: ${x.valore}`)].filter(Boolean).join("\n");
  const doppione = await findDuplicate(db, normalizeEmail(email), normalizePhone(r.telefono));
  if (doppione) {
    await db.insert(activities).values({ id: crypto.randomUUID(), leadId: doppione, type: "contatto", body: `Nuova richiesta dal modulo del sito${dettagli ? `\n${dettagli}` : ""}`, authorId: null, createdAt: now });
    return { tipo: "modulo", esito: "lead già presente", leadId: doppione };
  }
  const lead = await createLead(db, {
    company: r.azienda || r.nome || "Richiesta dal sito",
    contactName: r.nome,
    email,
    phone: r.telefono,
    source: "sito",
    notes: dettagli ? `Dal modulo del sito:\n${dettagli}` : null,
  }, null, now);
  await catenaLeadNuovo(env, lead.id, "sito", now);
  return { tipo: "modulo", esito: "lead creato", leadId: lead.id };
}

// --- Risposte dei lead ---

// Si tiene solo la parte nuova: via le righe citate e tutto quello che segue "Il giorno ... ha scritto:".
export function soloParteNuova(testo: string): string {
  const linee = testo.replace(/\r\n/g, "\n").split("\n");
  const fine = linee.findIndex((l) => /^(Il giorno .*ha scritto:|On .*wrote:|-{2,}\s*Messaggio originale|Da: .*<.*@.*>|From: )/i.test(l.trim()));
  return (fine >= 0 ? linee.slice(0, fine) : linee).filter((l) => !l.trim().startsWith(">")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function risposta(db: Db, m: Mail, leadId: string, now: number): Promise<Esito> {
  const corpo = accorcia(soloParteNuova(m.testo), 3000);
  await db.insert(activities).values({
    id: crypto.randomUUID(), leadId, type: "email", authorId: null, createdAt: m.data || now, requestId: `mail:${m.messageId}`,
    body: `Mail ricevuta: ${m.oggetto || "senza oggetto"}${corpo ? `\n\n${corpo}` : ""}`,
  }).onConflictDoNothing();
  return { tipo: "risposta", esito: "attività aggiunta", leadId };
}
