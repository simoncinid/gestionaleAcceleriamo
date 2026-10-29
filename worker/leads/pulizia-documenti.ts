import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, documentVersions } from "../db/schema";

// Pulizia dei documenti (decisione di Tommaso del 29/10/2026): un documento tolto resta recuperabile 30 giorni,
// poi il giro cancella davvero i suoi file su R2 e le sue righe. Toglie anche le cartelle R2 orfane
// (lead/<id>/ di un lead che non esiste più nel database), per esempio se una cancellazione su R2 era fallita.
export const GIORNI_DOCUMENTI = 30;
const GIORNO = 86_400_000;

// Un'unità è un documento scaduto o una cartella orfana. A documento: 1 lettura delle versioni e una batch da 2
// (3 query), 1 sottorichiesta (cancellazione su R2). A cartella orfana: 2 sottorichieste (elenco e cancellazione).
// Fisse: 2 query (documenti scaduti, controllo delle cartelle) e fino a PAGINE sottorichieste (elenco delle cartelle).
const PAGINE = 3;
export const COSTO_PULIZIA = { fisse: 2, perUnita: 3, sottoFisse: PAGINE, sottoPerUnita: 2, max: 20 };

export async function pulisciDocumenti(db: Db, d1: D1Database, bucket: R2Bucket | undefined, now: number, limite: number) {
  if (!bucket) return { spento: true, documenti: 0, cartelle: 0, sottorichieste: 0 };
  let sotto = 0;
  let fatti = 0;
  const scaduti = await db.select({ id: documents.id }).from(documents)
    .where(and(isNotNull(documents.deletedAt), lt(documents.deletedAt, now - GIORNI_DOCUMENTI * GIORNO)))
    .orderBy(documents.deletedAt).limit(limite);
  for (const d of scaduti) {
    const v = await db.select({ r2Key: documentVersions.r2Key }).from(documentVersions).where(eq(documentVersions.documentId, d.id));
    // Prima R2, poi il database: se R2 non risponde l'errore ferma il lavoro e le righe restano per il giro di domani.
    // A blocchi da 1000 (limite di R2 per una cancellazione), come in cestino.ts.
    for (let i = 0; i < v.length; i += 1000) { sotto++; await bucket.delete(v.slice(i, i + 1000).map((x) => x.r2Key)); }
    await db.batch([db.delete(documentVersions).where(eq(documentVersions.documentId, d.id)), db.delete(documents).where(eq(documents.id, d.id))]);
    fatti++;
  }

  let cartelle = 0;
  const resto = limite - fatti;
  if (resto > 0) {
    // Fino a PAGINE pagine da 1000 cartelle a giro (Riccardo: oltre la prima pagina le orfane restavano per sempre).
    const prefissi: string[] = [];
    let cursore: string | undefined;
    for (let pagina = 0; pagina < PAGINE; pagina++) {
      sotto++;
      const elenco = await bucket.list({ prefix: "lead/", delimiter: "/", cursor: cursore });
      prefissi.push(...elenco.delimitedPrefixes);
      if (!elenco.truncated) break;
      cursore = elenco.cursor;
    }
    const ids = prefissi.map((p) => p.slice("lead/".length, -1)).filter(Boolean);
    if (ids.length) {
      // Una query sola: gli id delle cartelle che non hanno un lead (cestinato compreso: quello resta).
      const r = await d1.prepare("SELECT value AS id FROM json_each(?1) WHERE value NOT IN (SELECT id FROM leads)").bind(JSON.stringify(ids)).all<{ id: string }>();
      for (const { id } of r.results.slice(0, resto)) {
        sotto += 2;
        const dentro = await bucket.list({ prefix: `lead/${id}/` });
        if (dentro.objects.length) await bucket.delete(dentro.objects.map((o) => o.key));
        cartelle++;
      }
    }
  }
  return { documenti: fatti, cartelle, sottorichieste: sotto };
}
