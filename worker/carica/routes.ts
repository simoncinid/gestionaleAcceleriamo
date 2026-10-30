import { and, eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { calls, documents, leads, stages, users } from "../db/schema";
import type { AppEnv } from "../env";
import { chiaveGiusta } from "../lib/chiave";
import { caricaDocumento, tipoCallDaQuery } from "../leads/documenti";
import { corpoFile } from "../leads/routes";

// Rotte dello script di caricamento sul Mac di Tommaso (spec documenti 29/10/2026, punto 6).
// Token dedicato CARICA_TOKEN: permette solo di cercare un lead e caricargli un documento, a nome di Tommaso.
// Le voci risultano semplicemente di Tommaso: nessuna dicitura in più nella scheda o nello storico (Tommaso, 30/10/2026).
export const caricaRoutes = new Hono<AppEnv>();
export const UTENTE_SCRIPT = "tommaso.rovini";

caricaRoutes.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await chiaveGiusta(token, c.env.CARICA_TOKEN))) return c.json({ error: "Token non valido" }, 401);
  await next();
});

// Lead per nome dell'azienda o del referente (almeno 2 caratteri), al massimo 10, cestinati esclusi.
caricaRoutes.get("/lead", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ error: "Scrivi almeno 2 caratteri del nome" }, 400);
  const testo = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const db = getDb(c.env.DB);
  const trovati = await db
    .select({ id: leads.id, company: leads.company, contactName: leads.contactName, fase: stages.label })
    .from(leads)
    .leftJoin(stages, eq(stages.id, leads.stageId))
    .where(and(isNull(leads.deletedAt), or(sql`${leads.company} LIKE ${testo} ESCAPE '\\'`, sql`${leads.contactName} LIKE ${testo} ESCAPE '\\'`)))
    .limit(10);
  return c.json({ leads: trovati });
});

// Carica un file nella scheda del lead. Corpo grezzo; ?nome=<file>, ?titolo= facoltativo,
// ?tipo= (registrazione, trascrizione, preventivo, altro), ?call= (id o tipo della call), ?data= (millisecondi, data del file),
// ?versione=1 per caricarlo come nuova versione del documento con lo stesso nome (titolo, o nome del file).
caricaRoutes.post("/lead/:id/documenti", async (c) => {
  const db = getDb(c.env.DB);
  const utente = await db.select({ id: users.id }).from(users).where(and(eq(users.username, UTENTE_SCRIPT), eq(users.active, true))).get();
  if (!utente) throw new HTTPException(500, { message: `Utente ${UTENTE_SCRIPT} non trovato` });
  const leadId = c.req.param("id");
  const fileName = c.req.query("nome") ?? "";
  const titolo = c.req.query("titolo");
  let documentId: string | undefined;
  if (c.req.query("versione") === "1") {
    const nome = (titolo?.trim() || fileName).trim();
    const uguali = await db.select({ id: documents.id, r2Key: documents.r2Key }).from(documents)
      .where(and(eq(documents.leadId, leadId), eq(documents.name, nome), isNull(documents.deletedAt)));
    const file = uguali.filter((d) => d.r2Key);
    if (file.length === 0) return c.json({ error: `Nessun documento "${nome}" su questo lead: caricalo senza --versione` }, 404);
    if (file.length > 1) return c.json({ error: `Più documenti si chiamano "${nome}": scegli dal gestionale` }, 409);
    documentId = file[0].id;
  }
  const { size, body } = corpoFile(c);
  const document = await caricaDocumento(c.env, db, { leadId, documentId, fileName, titolo, size, body, userId: utente.id, via: "script", now: Date.now(), ...tipoCallDaQuery((k) => c.req.query(k)) });
  // La call scelta torna indietro: lo script dice dove è finito il file.
  const k = document.callId ? await db.select({ kind: calls.kind, scheduledAt: calls.scheduledAt }).from(calls).where(eq(calls.id, document.callId)).get() : null;
  return c.json({ document: { ...document, call: k ?? null } }, 201);
});
