import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { activities, documents, documentVersions, leads, users } from "../db/schema";
import type { Env } from "../env";

// Documenti caricati nella scheda del lead (spec 29/10/2026): file su R2, versioni con storico, pallino delle novità.

export const LIMITE_FILE = 100 * 1024 * 1024; // 100 MB

// Tipi ammessi: il tipo lo decide il server dall'estensione, mai quello dichiarato da chi carica.
// "apri": anteprima nel browser (PDF, audio, immagini che il browser mostra); gli altri si scaricano.
const TIPI: Record<string, { mime: string; apri: boolean }> = {
  pdf: { mime: "application/pdf", apri: true },
  txt: { mime: "text/plain; charset=utf-8", apri: false },
  csv: { mime: "text/csv; charset=utf-8", apri: false },
  xls: { mime: "application/vnd.ms-excel", apri: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", apri: false },
  doc: { mime: "application/msword", apri: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", apri: false },
  m4a: { mime: "audio/mp4", apri: true },
  mp3: { mime: "audio/mpeg", apri: true },
  ogg: { mime: "audio/ogg", apri: true },
  opus: { mime: "audio/ogg", apri: true },
  wav: { mime: "audio/wav", apri: true },
  aac: { mime: "audio/aac", apri: true },
  jpg: { mime: "image/jpeg", apri: true },
  jpeg: { mime: "image/jpeg", apri: true },
  png: { mime: "image/png", apri: true },
  heic: { mime: "image/heic", apri: false },
};
export const ESTENSIONI = Object.keys(TIPI);

export function estensione(nome: string) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nome);
  return m ? m[1].toLowerCase() : "";
}

export function tipoDi(nome: string) {
  return TIPI[estensione(nome)] ?? null;
}

// Nome del file pulito: niente percorsi, caratteri di controllo o virgolette; massimo 200 caratteri, estensione salva.
export function nomePulito(nome: string) {
  const base = nome.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  // Via anche i caratteri che invertono il verso del testo (nome che inganna l'occhio, Riccardo).
  const pulito = base.replace(/[\u0000-\u001f\u007f"<>‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
  if (pulito.length <= 200) return pulito;
  const est = estensione(pulito);
  return `${pulito.slice(0, 200 - est.length - 1)}.${est}`;
}

export type Caricamento = {
  leadId: string;
  documentId?: string; // presente: nuova versione di quel documento
  fileName: string;
  titolo?: string | null;
  size: number;
  body: ReadableStream<Uint8Array>;
  userId: string;
  via?: "claude" | null;
  now: number;
};

// Carica il file su R2 in streaming (niente copia in memoria) e scrive documento, versione e storico.
export async function caricaDocumento(env: Env, db: Db, c: Caricamento) {
  const bucket = env.DOCUMENTI;
  if (!bucket) throw new HTTPException(503, { message: "L'archivio dei file non è ancora collegato" });
  const fileName = nomePulito(c.fileName);
  const tipo = tipoDi(fileName);
  if (!fileName || !tipo) throw new HTTPException(415, { message: `Tipo di file non ammesso. Vanno bene: ${ESTENSIONI.join(", ")}` });
  if (!Number.isSafeInteger(c.size) || c.size <= 0) throw new HTTPException(411, { message: "Il file è vuoto o manca la sua lunghezza" });
  if (c.size > LIMITE_FILE) throw new HTTPException(413, { message: "Il file supera i 100 MB" });

  const lead = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, c.leadId), isNull(leads.deletedAt))).get();
  if (!lead) throw new HTTPException(404, { message: "Lead non trovato" });

  let esistente: typeof documents.$inferSelect | undefined;
  if (c.documentId) {
    esistente = await db.select().from(documents).where(and(eq(documents.id, c.documentId), eq(documents.leadId, c.leadId), isNull(documents.deletedAt))).get();
    if (!esistente) throw new HTTPException(404, { message: "Documento non trovato" });
    if (!esistente.r2Key) throw new HTTPException(409, { message: "Un link non ha versioni: carica il file come documento nuovo" });
  }

  const documentId = esistente?.id ?? crypto.randomUUID();
  const versione = (esistente?.version ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const r2Key = `lead/${c.leadId}/${documentId}/${versionId}`;

  // FixedLengthStream: R2 vuole la lunghezza nota; se il corpo è più lungo o più corto di quella dichiarata, il caricamento fallisce.
  const { readable, writable } = new FixedLengthStream(c.size);
  try {
    await Promise.all([c.body.pipeTo(writable), bucket.put(r2Key, readable, { httpMetadata: { contentType: tipo.mime } })]);
  } catch (err) {
    await bucket.delete(r2Key).catch(() => undefined);
    console.error("documento_r2", err);
    throw new HTTPException(400, { message: "Caricamento interrotto: riprova" });
  }

  const nome = (c.titolo?.trim() || fileName).slice(0, 200);
  const dettaglio = c.via === "claude" ? " (caricato da Claude)" : "";
  const riga = { id: versionId, documentId, version: versione, r2Key, fileName, mime: tipo.mime, size: c.size, createdBy: c.userId, via: c.via ?? null, createdAt: c.now };
  try {
    if (esistente) {
      await db.batch([
        db.update(documents).set({ r2Key, mime: tipo.mime, size: c.size, version: versione, updatedAt: c.now }).where(eq(documents.id, documentId)),
        db.insert(documentVersions).values(riga),
        db.insert(activities).values({ id: crypto.randomUUID(), leadId: c.leadId, type: "documento", body: `Nuova versione (${versione}) del documento "${esistente.name}"${dettaglio}`, authorId: c.userId, createdAt: c.now }),
        db.update(leads).set({ updatedAt: c.now }).where(eq(leads.id, c.leadId)),
      ]);
    } else {
      await db.batch([
        db.insert(documents).values({ id: documentId, leadId: c.leadId, name: nome, url: null, r2Key, createdBy: c.userId, createdAt: c.now, deletedAt: null, mime: tipo.mime, size: c.size, version: 1, via: c.via ?? null, updatedAt: c.now }),
        db.insert(documentVersions).values(riga),
        db.insert(activities).values({ id: crypto.randomUUID(), leadId: c.leadId, type: "documento", body: `Caricato il documento "${nome}"${dettaglio}`, authorId: c.userId, createdAt: c.now }),
        db.update(leads).set({ updatedAt: c.now }).where(eq(leads.id, c.leadId)),
      ]);
    }
  } catch (err) {
    // Il database non ha scritto (per esempio due versioni nello stesso istante): il file non resta orfano.
    await bucket.delete(r2Key).catch(() => undefined);
    throw err;
  }
  return { id: documentId, version: versione, name: esistente?.name ?? nome };
}

// Documenti di un lead con il nome di chi li ha messi (per la scheda).
export async function documentiDelLead(db: Db, leadId: string) {
  return db
    .select({
      id: documents.id, leadId: documents.leadId, name: documents.name, url: documents.url, createdAt: documents.createdAt,
      updatedAt: documents.updatedAt, mime: documents.mime, size: documents.size, version: documents.version, via: documents.via,
      hasFile: documents.r2Key, authorName: users.name,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(and(eq(documents.leadId, leadId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt))
    .then((r) => r.map(({ hasFile, ...d }) => ({ ...d, file: Boolean(hasFile) })));
}

export async function versioniDi(db: Db, documentId: string) {
  await documentoVivo(db, documentId);
  return db
    .select({ id: documentVersions.id, version: documentVersions.version, fileName: documentVersions.fileName, mime: documentVersions.mime, size: documentVersions.size, via: documentVersions.via, createdAt: documentVersions.createdAt, authorName: users.name })
    .from(documentVersions)
    .leftJoin(users, eq(users.id, documentVersions.createdBy))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version));
}

// encodeURIComponent lascia ' ( ) *, che RFC 5987 non ammette in filename*.
const rfc5987 = (t: string) => encodeURIComponent(t).replace(/['()*]/g, (x) => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);

// Documento non tolto di un lead non cestinato: file e storico di un lead nel cestino non si aprono.
async function documentoVivo(db: Db, documentId: string) {
  const r = await db.select({ doc: documents }).from(documents).innerJoin(leads, eq(leads.id, documents.leadId))
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt), isNull(leads.deletedAt))).get();
  if (!r) throw new HTTPException(404, { message: "Documento non trovato" });
  return r.doc;
}

// Il file di un documento (ultima versione o quella chiesta), letto da R2: risposta con intestazioni prudenti.
export async function apriFile(env: Env, db: Db, documentId: string, versione: number | null, scarica: boolean) {
  const doc = await documentoVivo(db, documentId);
  const riga = await db.select().from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, versione ?? doc.version))).get();
  if (!riga) throw new HTTPException(404, { message: "Versione non trovata" });
  if (!env.DOCUMENTI) throw new HTTPException(503, { message: "L'archivio dei file non è ancora collegato" });
  const obj = await env.DOCUMENTI.get(riga.r2Key);
  if (!obj) throw new HTTPException(404, { message: "File non trovato nell'archivio" });
  // Il tipo si ricalcola dal nome salvato: vale la lista chiusa di oggi, non quello scritto in R2.
  const tipo = tipoDi(riga.fileName) ?? { mime: "application/octet-stream", apri: false };
  const modo = tipo.apri && !scarica ? "inline" : "attachment";
  const ascii = riga.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(obj.body, {
    headers: {
      "content-type": tipo.mime,
      "content-length": String(obj.size),
      "content-disposition": `${modo}; filename="${ascii}"; filename*=UTF-8''${rfc5987(riga.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

// Chiavi R2 di tutte le versioni dei documenti di un lead (per "Elimina per sempre").
export async function chiaviDelLead(db: Db, leadId: string) {
  const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.leadId, leadId));
  if (!docs.length) return { docIds: [] as string[], chiavi: [] as string[] };
  const docIds = docs.map((d) => d.id);
  const v = await db.select({ r2Key: documentVersions.r2Key }).from(documentVersions).where(inArray(documentVersions.documentId, docIds));
  return { docIds, chiavi: v.map((x) => x.r2Key) };
}

// Pallino (spec, punto 4): versioni di file e link messi da un'altra persona dopo l'ultima apertura della scheda.
// Le cancellazioni non contano; un documento tolto non conta più.
function sqlNovita(conLead: boolean) {
  const filtro = conLead ? " AND d.lead_id = ?2" : "";
  return `SELECT x.lead_id AS leadId, x.doc_id AS docId FROM (
      SELECT d.lead_id, d.id AS doc_id, v.created_by, v.created_at FROM document_versions v JOIN documents d ON d.id = v.document_id
        WHERE d.deleted_at IS NULL${filtro}
      UNION ALL
      SELECT d.lead_id, d.id, d.created_by, d.created_at FROM documents d WHERE d.deleted_at IS NULL AND d.r2_key IS NULL${filtro}
    ) x LEFT JOIN lead_visti s ON s.lead_id = x.lead_id AND s.user_id = ?1
    WHERE coalesce(x.created_by, '') <> ?1 AND x.created_at > coalesce(s.seen_at, 0)`;
}

export async function novitaPerLead(db: D1Database, userId: string): Promise<Map<string, number>> {
  const r = await db.prepare(`SELECT leadId, count(*) AS n FROM (${sqlNovita(false)}) GROUP BY leadId`).bind(userId).all<{ leadId: string; n: number }>();
  return new Map(r.results.map((x) => [x.leadId, x.n]));
}

export async function conNovita<T extends { id: string }>(db: D1Database, userId: string, elenco: T[]): Promise<(T & { novita: number })[]> {
  if (elenco.length === 0) return [];
  const m = await novitaPerLead(db, userId);
  return elenco.map((l) => ({ ...l, novita: m.get(l.id) ?? 0 }));
}

// Apertura della scheda: restituisce le novità di prima (per mostrarle nella scheda) e azzera il pallino.
export async function segnaVisto(db: D1Database, userId: string, leadId: string, now: number) {
  const r = await db.prepare(sqlNovita(true)).bind(userId, leadId).all<{ leadId: string; docId: string }>();
  await db
    .prepare("INSERT INTO lead_visti (user_id, lead_id, seen_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id, lead_id) DO UPDATE SET seen_at = max(seen_at, excluded.seen_at)")
    .bind(userId, leadId, now)
    .run();
  return { novita: r.results.length, nuovi: [...new Set(r.results.map((x) => x.docId))] };
}
