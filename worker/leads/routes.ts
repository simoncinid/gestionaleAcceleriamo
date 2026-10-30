import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { getDb } from "../db/client";
import { activities, CALL_KINDS, calls, documents, jobs, leads, users } from "../db/schema";
import type { AppEnv } from "../env";
import { VISTE, addActivity, azioniMultiple, cercaDoppioni, clienteDelLead, getLead, ingressoLead, riscontro, listLeads, mergeLeads, restoreLead, softDeleteLead, updateLead, type Vista } from "./service";
import { activitySchema, bulkSchema, documentSchema, leadCreateSchema, leadPatchSchema, mergeSchema } from "./validation";
import { audit } from "../lib/audit";
import { catenaLeadNuovo } from "../regole/catena";
import { z } from "zod";
import { ESITI, propostaEsito } from "../regole/motore";
import { contestoRegole } from "../impostazioni/service";
import { callDelLead, callNuovaSchema, fissaCall, segnaNoShow } from "../calls/service";
import { esitoSchema, primoTentativoAt, registraContatto, salvaEsito } from "./esito";
import { proposteDelLead } from "../proposte/service";
import { conScadenzaSla, leggiSla } from "../regole/sla";
import { AZIONE_CALL, callPerFase } from "../regole/fasi-call";
import { conProssima } from "../processo/leggi";
import { confermaInvito } from "../posta/service";
import { eliminaPerSempre, leggiCestino } from "./cestino";
import { normalizeEmail, normalizePhone } from "../lib/normalize";
import { collegamentiDelLead } from "./collegamenti";
import { conUltimoContatto } from "./ultimo-contatto";
import { apriFile, caricaDocumento, conNovita, documentiDelLead, segnaVisto, tipoCallDaQuery, versioniDi } from "./documenti";
import type { Context } from "hono";

// Corpo grezzo di un caricamento: il file è tutto il corpo, la lunghezza viene da Content-Length.
// Solo application/octet-stream: un altro tipo obbliga il browser al controllo preventivo, che ferma le pagine estranee (Riccardo).
export function corpoFile(c: Context<AppEnv>) {
  if ((c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/octet-stream") {
    throw new HTTPException(415, { message: "Il file va mandato come application/octet-stream" });
  }
  const size = Number(c.req.header("content-length") ?? Number.NaN);
  const body = c.req.raw.body;
  if (!body) throw new HTTPException(411, { message: "Il file è vuoto o manca la sua lunghezza" });
  return { size, body };
}

export const leadRoutes = new Hono<AppEnv>();

leadRoutes.get("/", async (c) => {
  const q = c.req.query();
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const score = ["verde", "giallo", "grigio"].includes(q.score ?? "") ? (q.score as "verde" | "giallo" | "grigio") : undefined;
  const vista = q.vista && Object.hasOwn(VISTE, q.vista) ? (q.vista as Vista) : undefined;
  const db = getDb(c.env.DB);
  const [rows, sla] = await Promise.all([
    listLeads(db, { q: q.q, stageId: q.stageId, source: q.source, campaign: q.campaign, ownerId: q.ownerId, score, vista, da: num(q.da), a: num(q.a) }),
    leggiSla(db),
  ]);
  // Corsia C (modifica 18): la tabella mostra anche l'ultimo contatto.
  // Spec documenti 29/10/2026: "novita" è il pallino arancione delle novità caricate da altri e non viste.
  const elenco = await conUltimoContatto(c.env.DB, await conProssima(db, rows.map((l) => conScadenzaSla(l, sla)), Date.now()));
  return c.json({ leads: await conNovita(c.env.DB, c.get("user").id, elenco) });
});

// Prima delle rotte con /:id.
leadRoutes.post("/bulk", async (c) => {
  const input = bulkSchema.parse(await c.req.json());
  return c.json(await azioniMultiple(getDb(c.env.DB), input, c.get("user").id));
});

leadRoutes.get("/trash", async (c) => c.json({ leads: await leggiCestino(getDb(c.env.DB), Date.now()) }));

leadRoutes.post("/", async (c) => {
  const input = leadCreateSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  const now = Date.now();
  // Doppioni (modifica 8): con un lead aperto o cliente non nasce niente, il foglio mostra "Esiste già: apri <azienda>";
  // con un lead in 80 quello si riapre in 10; con uno in 90 o nel cestino nasce il nuovo con l'avviso.
  const trovati = await cercaDoppioni(db, normalizeEmail(input.email), normalizePhone(input.phone));
  const r = riscontro(trovati);
  if (r?.tipo === "aperto") return c.json({ error: `Esiste già: ${r.lead.company}`, esistente: { id: r.lead.id, company: r.lead.company } }, 409);
  const ing = await ingressoLead(db, input, "A mano", c.get("user").id, now, trovati);
  if (ing.esito !== "creato") {
    const [riaperto] = await conProssima(db, [conScadenzaSla(ing.lead, await leggiSla(db))], Date.now());
    return c.json({ lead: riaperto, riaperto: true }, 200);
  }
  const creato = ing.lead;
  // Un errore della catena (regole, avvisi) non deve far fallire la creazione del lead.
  try {
    await catenaLeadNuovo(c.env, creato.id, "manuale", now);
  } catch (e) {
    console.error("catena_lead_nuovo", e);
  }
  const [nuovo] = await conProssima(db, [conScadenzaSla(await getLead(db, creato.id), await leggiSla(db))], Date.now());
  return c.json({ lead: nuovo }, 201);
});

leadRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const [lead] = await conProssima(db, [conScadenzaSla(await getLead(db, c.req.param("id")), await leggiSla(db))], Date.now());
  const history = await db
    .select({ id: activities.id, type: activities.type, body: activities.body, createdAt: activities.createdAt, authorId: activities.authorId, authorName: users.name })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.authorId))
    .where(eq(activities.leadId, lead.id))
    .orderBy(desc(activities.createdAt));
  const docs = await documentiDelLead(db, lead.id);
  const duplicateOf = lead.duplicateOfId
    ? ((await db.select({ id: leads.id, company: leads.company }).from(leads).where(and(eq(leads.id, lead.duplicateOfId), isNull(leads.deletedAt))).get()) ?? null)
    : null;
  const base = await clienteDelLead(db, lead.id);
  const lavori = base ? ((await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.clientId, base.id), isNull(jobs.deletedAt))).limit(1)).length) : 0;
  const cliente = base ? { ...base, haLavori: lavori > 0 } : null;
  return c.json({ lead, activities: history.map((a) => ({ ...a, authorName: a.authorName ?? "Sistema" })), documents: docs, duplicateOf, cliente });
});

// Campi per andare in 80 (blocco 1, modifica 7), letti qui perché lo schema del lead resta quello della creazione.
const chiusuraSchema = z.object({ lostNote: z.string().trim().max(500).nullish(), recontactAt: z.number().int().nullish() });

leadRoutes.patch("/:id", async (c) => {
  const corpo = (await c.req.json()) as Record<string, unknown>;
  const { lostNote, recontactAt, ...resto } = corpo;
  const patch = { ...leadPatchSchema.parse(resto), ...chiusuraSchema.parse({ lostNote, recontactAt }) };
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const io = c.get("user").id;
  const kind = callPerFase(patch.stageId);
  if (kind) {
    const current = await getLead(db, id);
    if (current.stageId !== patch.stageId) {
      const now = Date.now();
      const { stageId: _fase, callAt, ...resto } = patch;
      if (callAt != null) {
        // Q14: la call si fissa come da "Fissa call": fase, prossima azione e storico li applica il motore.
        if (Object.keys(resto).length) await updateLead(db, id, resto, io, now);
        await fissaCall(c.env, db, id, { kind, scheduledAt: callAt, meetLink: null, invito: false }, io, now);
        return c.json({ lead: await getLead(db, id) });
      }
      // Senza data va bene solo se la call c'è già (per esempio "Annulla" dopo uno spostamento).
      const esistente = await db
        .select({ scheduledAt: calls.scheduledAt })
        .from(calls)
        .where(and(eq(calls.leadId, id), eq(calls.kind, kind), isNull(calls.deletedAt), isNull(calls.outcome), gte(calls.scheduledAt, now)))
        .orderBy(asc(calls.scheduledAt))
        .get();
      if (!esistente) throw new HTTPException(422, { message: "Per questa fase serve la call: scegli giorno e ora" });
      const lead = await updateLead(db, id, { ...patch, nextAction: AZIONE_CALL[kind], nextActionAt: esistente.scheduledAt }, io, now);
      return c.json({ lead });
    }
  }
  const lead = await updateLead(db, id, patch, io);
  return c.json({ lead });
});

leadRoutes.patch("/:id/esito", async (c) => {
  const input = esitoSchema.parse(await c.req.json());
  const r = await salvaEsito(getDb(c.env.DB), c.req.param("id"), input, c.get("user").id, Date.now());
  return c.json(r);
});

// "Non si è presentato" (fasi 30, 40, 45, 55): regola del no-show, la fase resta (contratto blocco 1, sezione 2).
leadRoutes.post("/:id/no-show", async (c) => {
  const { kind } = z.object({ kind: z.enum(CALL_KINDS) }).strict().parse(await c.req.json());
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await segnaNoShow(db, id, kind, c.get("user").id, Date.now());
  const [lead] = await conProssima(db, [conScadenzaSla(await getLead(db, id), await leggiSla(db))], Date.now());
  return c.json({ lead });
});

// Invito di Google accettato o spostato dal cliente: la fase cambia solo con questa conferma (blocco 1, modifica 12).
leadRoutes.post("/:id/inviti/:activityId/conferma", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await confermaInvito(db, id, c.req.param("activityId"), c.get("user").id, Date.now());
  const [lead] = await conProssima(db, [conScadenzaSla(await getLead(db, id), await leggiSla(db))], Date.now());
  return c.json({ lead });
});

const contattoSchema = z.object({ canale: z.enum(["chiamata", "whatsapp", "email"]), modello: z.string().optional() }).strict();

leadRoutes.post("/:id/contatti", async (c) => {
  const input = contattoSchema.parse(await c.req.json());
  await registraContatto(getDb(c.env.DB), c.req.param("id"), input, c.get("user").id, Date.now());
  return c.json({ ok: true }, 201);
});

leadRoutes.get("/:id/calls", async (c) => c.json({ calls: await callDelLead(getDb(c.env.DB), c.req.param("id")) }));
leadRoutes.get("/:id/proposals", async (c) => c.json({ proposte: await proposteDelLead(getDb(c.env.DB), c.req.param("id")) }));
leadRoutes.get("/:id/collegamenti", async (c) => c.json(await collegamentiDelLead(getDb(c.env.DB), c.req.param("id"))));

leadRoutes.post("/:id/calls", async (c) => {
  const input = callNuovaSchema.parse(await c.req.json());
  const db = getDb(c.env.DB);
  await getLead(db, c.req.param("id"));
  return c.json(await fissaCall(c.env, db, c.req.param("id"), input, c.get("user").id, Date.now()), 201);
});

// Le regole propongono, le persone salvano: questa rotta calcola soltanto, non scrive nulla.
leadRoutes.get("/:id/proposta", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  const esito = z.enum(ESITI).parse(c.req.query("esito"));
  const callAt = c.req.query("callAt");
  const ctx = await contestoRegole(db, Date.now());
  const p = propostaEsito(esito, { stageId: lead.stageId, attemptCount: lead.attemptCount, primoTentativoAt: await primoTentativoAt(db, lead.id) }, ctx, callAt ? { scheduledAt: z.coerce.number().int().parse(callAt) } : undefined);
  return c.json(p);
});

leadRoutes.delete("/:id", async (c) => {
  await softDeleteLead(getDb(c.env.DB), c.req.param("id"), c.get("user").id);
  return c.json({ ok: true });
});

// Blocco 1, modifica 9: elimina per sempre un lead che è già nel cestino.
leadRoutes.delete("/:id/per-sempre", async (c) => {
  await eliminaPerSempre(getDb(c.env.DB), c.req.param("id"), c.get("user").id, Date.now(), c.env.DOCUMENTI);
  return c.json({ ok: true });
});

leadRoutes.post("/:id/restore", async (c) => {
  await restoreLead(getDb(c.env.DB), c.req.param("id"), c.get("user").id);
  return c.json({ ok: true });
});

leadRoutes.post("/:id/merge", async (c) => {
  const { intoId } = mergeSchema.parse(await c.req.json());
  const lead = await mergeLeads(getDb(c.env.DB), c.req.param("id"), intoId, c.get("user").id);
  return c.json({ lead });
});

leadRoutes.post("/:id/activities", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  const { type, body } = activitySchema.parse(await c.req.json());
  const now = Date.now();
  await addActivity(db, lead.id, type, body, c.get("user").id, now);
  await db.update(leads).set({ updatedAt: now }).where(eq(leads.id, lead.id));
  return c.json({ ok: true }, 201);
});

// Apertura della scheda: azzera il pallino e restituisce le novità che c'erano (la scheda le mostra).
leadRoutes.post("/:id/visto", async (c) => {
  const db = getDb(c.env.DB);
  const lead = await getLead(db, c.req.param("id"));
  return c.json(await segnaVisto(c.env.DB, c.get("user").id, lead.id, Date.now()));
});

// Un link (corpo JSON) o un file (corpo grezzo, nome in ?nome=, titolo facoltativo in ?titolo=,
// ?tipo= e ?call= facoltativi: senza, li decidono le regole di worker/leads/tipo-documento.ts).
leadRoutes.post("/:id/documents", async (c) => {
  const db = getDb(c.env.DB);
  if (!(c.req.header("content-type") ?? "").startsWith("application/json")) {
    const { size, body } = corpoFile(c);
    const document = await caricaDocumento(c.env, db, { leadId: c.req.param("id"), fileName: c.req.query("nome") ?? "", titolo: c.req.query("titolo"), size, body, userId: c.get("user").id, now: Date.now(), ...tipoCallDaQuery((k) => c.req.query(k)) });
    return c.json({ document }, 201);
  }
  const lead = await getLead(db, c.req.param("id"));
  const { name, url } = documentSchema.parse(await c.req.json());
  const now = Date.now();
  const document = { id: crypto.randomUUID(), leadId: lead.id, name, url, r2Key: null, createdBy: c.get("user").id, createdAt: now, deletedAt: null };
  await db.insert(documents).values(document);
  await addActivity(db, lead.id, "documento", `Aggiunto il documento "${name}"`, c.get("user").id, now);
  return c.json({ document }, 201);
});

export const documentRoutes = new Hono<AppEnv>();

// Nuova versione di un documento caricato: corpo grezzo, nome del file in ?nome=.
documentRoutes.post("/:id/versioni", async (c) => {
  const db = getDb(c.env.DB);
  const doc = await db.select({ leadId: documents.leadId }).from(documents).where(and(eq(documents.id, c.req.param("id")), isNull(documents.deletedAt))).get();
  if (!doc) return c.json({ error: "Documento non trovato" }, 404);
  const { size, body } = corpoFile(c);
  const document = await caricaDocumento(c.env, db, { leadId: doc.leadId, documentId: c.req.param("id"), fileName: c.req.query("nome") ?? "", size, body, userId: c.get("user").id, now: Date.now() });
  return c.json({ document }, 201);
});

documentRoutes.get("/:id/versioni", async (c) => c.json({ versioni: await versioniDi(getDb(c.env.DB), c.req.param("id")) }));

// Il file passa solo da qui, dietro la sessione: ?versione=N per una versione vecchia, ?scarica=1 per scaricarlo.
documentRoutes.get("/:id/file", async (c) => {
  const v = c.req.query("versione");
  const versione = v && /^\d{1,6}$/.test(v) ? Number(v) : null;
  return apriFile(c.env, getDb(c.env.DB), c.req.param("id"), versione, c.req.query("scarica") === "1");
});

documentRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const doc = await db.select().from(documents).where(and(eq(documents.id, id), isNull(documents.deletedAt))).get();
  if (!doc) return c.json({ error: "Documento non trovato" }, 404);
  const now = Date.now();
  await db.update(documents).set({ deletedAt: now }).where(eq(documents.id, id));
  await addActivity(db, doc.leadId, "documento", `Tolto il documento "${doc.name}"`, c.get("user").id, now);
  await audit(db, c.get("user").id, "document", id, "delete", undefined, now);
  return c.json({ ok: true });
});
