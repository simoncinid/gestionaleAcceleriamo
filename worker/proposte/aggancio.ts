import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, type Db } from "../db/client";
import { activities, hookLog, leads, proposals, stages } from "../db/schema";
import type { AppEnv } from "../env";
import { segnaErrore, segnaOk } from "../integrazioni/stato";
import { normalizzaAzienda } from "../lib/testo";
import { daRoma } from "../lib/roma";
import type { z } from "zod";
import { hookSchema } from "./schema";
import { passiRegistrata } from "./service";

export const agganciRoutes = new Hono<AppEnv>();
const MASSIMO = 16 * 1024;
const ORA = 3_600_000;

async function chiaveGiusta(data: string | undefined, attesa: string | undefined) {
  if (!data || !attesa) return false;
  const enc = new TextEncoder();
  // Si confrontano le impronte SHA-256 (stessa lunghezza) byte per byte, senza uscire prima: tempo costante.
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(data)), crypto.subtle.digest("SHA-256", enc.encode(attesa))]).then((d) => d.map((x) => new Uint8Array(x)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function registra(db: Db, now: number, status: number, number: string | null, outcome: string) {
  await db.batch([
    db.insert(hookLog).values({ id: crypto.randomUUID(), at: now, status, number, outcome }),
    db.delete(hookLog).where(lt(hookLog.at, now - 30 * 86_400_000)),
  ]);
}

// Spec 6.8, abbinamento: prima l'id, poi il nome normalizzato tra i lead aperti. Più di un candidato = da abbinare.
async function trovaLead(db: Db, id: string | null | undefined, azienda: string | null | undefined) {
  if (id) {
    const l = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), isNull(leads.deletedAt))).get();
    if (l) return l.id;
  }
  const chiave = normalizzaAzienda(azienda);
  if (!chiave) return null;
  const aperti = await db.select({ id: leads.id, company: leads.company }).from(leads).innerJoin(stages, eq(stages.id, leads.stageId))
    .where(and(isNull(leads.deletedAt), eq(stages.kind, "open")));
  const uguali = aperti.filter((l) => normalizzaAzienda(l.company) === chiave);
  return uguali.length === 1 ? uguali[0].id : null;
}

// Scrive la proposta (nuova o versione successiva) e, se diventa registrata su un lead, i passi del motore: tutto in un batch.
async function salva(db: Db, b: z.infer<typeof hookSchema>, now: number) {
  const validUntil = b.validita ? daRoma(Number(b.validita.slice(0, 4)), Number(b.validita.slice(5, 7)), Number(b.validita.slice(8, 10)), 23, 59) : null;
  const campi = {
    option: b.opzione, setupCents: b.setup ?? null, feeCents: b.canone ?? null, hoursEstimate: b.ore ?? null,
    alternativeCents: b.alternativa_proprieta ?? null, validUntil, pdfUrl: b.link_pdf ?? null, sourcePath: b.sourcePath, updatedAt: now,
    forbiceDaCents: b.forbice_da ?? null, forbiceACents: b.forbice_a ?? null,
  };
  const esistente = await db.select().from(proposals).where(eq(proposals.number, b.numero)).get();
  const leadTrovato = await trovaLead(db, b.lead, b.azienda);
  let avviso: string | undefined;

  if (esistente) {
    const leadId = esistente.leadId ?? leadTrovato;
    if (esistente.leadId && b.lead && b.lead !== esistente.leadId) {
      const di = await db.select({ company: leads.company }).from(leads).where(eq(leads.id, esistente.leadId)).get();
      avviso = `Il numero ${b.numero} è già della proposta di ${di?.company ?? "un altro lead"}: lead non cambiato`;
    }
    const diventaRegistrata = b.stato === "sent" && esistente.status === "bozza";
    // Una registrata che arriva qui senza lead e ora ne trova uno fa gli stessi passi di abbina(): prezzo sul lead e regola.
    const abbinataOra = !esistente.leadId && Boolean(leadId) && esistente.status === "registrata";
    const versione = esistente.version + 1;
    const passi = [
      db.update(proposals).set({ ...campi, leadId, version: versione, ...(diventaRegistrata ? { status: "registrata" as const, sentAt: now } : {}) }).where(eq(proposals.id, esistente.id)),
      ...(leadId ? [db.insert(activities).values({ id: crypto.randomUUID(), leadId, type: "proposta" as const, body: diventaRegistrata ? `Preventivo ${b.numero} registrato dal wiki` : abbinataOra ? `Preventivo ${b.numero} abbinato a questo lead dal wiki` : `Preventivo ${b.numero} aggiornato dal wiki (versione ${versione})`, authorId: null, createdAt: now })] : []),
      ...(leadId && (diventaRegistrata || abbinataOra) ? await passiRegistrata(db, leadId, campi, null, now) : []),
    ];
    await db.batch(passi as [typeof passi[number], ...typeof passi]);
    return { http: 200 as const, esito: avviso ? "aggiornata, lead non cambiato" : "aggiornata", corpo: { id: esistente.id, numero: b.numero, versione, stato: leadId ? "abbinata" : "da_abbinare", ...(avviso ? { avviso } : {}) } };
  }

  const id = crypto.randomUUID();
  const registrata = b.stato === "sent";
  const passi = [
    db.insert(proposals).values({ id, number: b.numero, leadId: leadTrovato, company: b.azienda ?? null, status: registrata ? "registrata" : "bozza", sentAt: registrata ? now : null, registeredVia: "aggancio", createdAt: now, ...campi }),
    ...(leadTrovato ? [db.insert(activities).values({ id: crypto.randomUUID(), leadId: leadTrovato, type: "proposta" as const, body: registrata ? `Preventivo ${b.numero} registrato dal wiki` : `Preventivo ${b.numero} in bozza dal wiki`, authorId: null, createdAt: now })] : []),
    ...(leadTrovato && registrata ? await passiRegistrata(db, leadTrovato, campi, null, now) : []),
  ];
  await db.batch(passi as [typeof passi[number], ...typeof passi]);
  return { http: 201 as const, esito: leadTrovato ? "abbinata" : "da abbinare", corpo: { id, numero: b.numero, versione: 1, stato: leadTrovato ? "abbinata" : "da_abbinare" } };
}

agganciRoutes.post("/proposals", async (c) => {
  const db = getDb(c.env.DB);
  const now = Date.now();
  // Senza il prefisso Bearer la chiave non vale. La risposta è sempre la stessa: non dice cosa non va.
  const chiave = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
  // Senza chiave giusta non si scrive nulla, nemmeno nel registro: chi non ha la chiave non consuma scritture né il limite.
  if (!(await chiaveGiusta(chiave, c.env.PROPOSAL_HOOK_KEY))) return c.json({ error: "Chiave non valida" }, 401);
  const recenti = await db.select({ id: hookLog.id }).from(hookLog).where(gte(hookLog.at, now - ORA));
  if (recenti.length >= 30) {
    await registra(db, now, 429, null, "limite");
    return c.json({ error: "Troppe chiamate in un'ora: riprova più tardi" }, 429);
  }
  // Il limite si controlla prima di leggere il JSON: dalla lunghezza dichiarata, poi dai byte davvero arrivati.
  const dichiarata = Number(c.req.header("content-length") ?? 0);
  const testo = dichiarata > MASSIMO ? null : await c.req.text();
  if (testo == null || new TextEncoder().encode(testo).byteLength > MASSIMO) {
    await registra(db, now, 413, null, "troppo grande");
    await segnaErrore(db, "aggancio", "Corpo oltre 16 KB", now);
    return c.json({ error: "Corpo oltre 16 KB" }, 413);
  }
  let grezzo: unknown;
  try { grezzo = JSON.parse(testo); } catch { grezzo = null; }
  const v = hookSchema.safeParse(grezzo);
  if (!v.success) {
    await registra(db, now, 400, null, v.error.issues[0]?.message ?? "corpo non valido");
    await segnaErrore(db, "aggancio", `Corpo non valido: ${v.error.issues[0]?.message ?? "formato sbagliato"}`, now);
    return c.json({ error: v.error.issues[0]?.message ?? "Corpo non valido" }, 400);
  }
  const b = v.data;
  try {
    const r = await salva(db, b, now);
    await registra(db, now, r.http, b.numero, r.esito);
    await segnaOk(db, "aggancio", now);
    return c.json(r.corpo, r.http);
  } catch (e) {
    await registra(db, now, 500, b.numero, "errore nel salvataggio");
    await segnaErrore(db, "aggancio", e instanceof Error ? e.message : String(e), now);
    throw e;
  }
});
