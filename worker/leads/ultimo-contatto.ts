// Colonna "Ultimo contatto" della tabella dei lead (contratto blocco 1, sezione 4): l'ultima volta che qualcuno
// ha parlato o scritto al lead. Contano chiamate e messaggi avviati, esiti, email e call, e (blocco 1 bis, rilievo
// di Corrado) anche le note scritte da una persona e le call in agenda: fissare una call vuol dire averci parlato,
// una call già fatta conta dalla sua ora. Non contano cambi di fase, note automatiche (senza autore) ed eventi
// automatici. Una sola query raggruppata per tutto l'elenco.
export const TIPI_CONTATTO = ["chiamata", "contatto", "esito", "email", "call"] as const;

export async function ultimiContatti(db: D1Database, adesso = Date.now()): Promise<Map<string, number>> {
  const segnaposto = TIPI_CONTATTO.map(() => "?").join(", ");
  const r = await db
    .prepare(`SELECT leadId, max(ultimo) AS ultimo FROM (
        SELECT a.lead_id AS leadId, a.created_at AS ultimo FROM activities a
          WHERE a.type IN (${segnaposto}) OR (a.type = 'nota' AND a.author_id IS NOT NULL)
        UNION ALL
        SELECT c.lead_id, CASE WHEN c.scheduled_at <= ? AND coalesce(c.outcome, '') <> 'saltata' THEN max(c.created_at, c.scheduled_at) ELSE c.created_at END
          FROM calls c WHERE c.deleted_at IS NULL
      ) x JOIN leads l ON l.id = x.leadId WHERE l.deleted_at IS NULL GROUP BY leadId`)
    .bind(...TIPI_CONTATTO, adesso)
    .all<{ leadId: string; ultimo: number }>();
  return new Map(r.results.map((x) => [x.leadId, x.ultimo]));
}

export async function conUltimoContatto<T extends { id: string }>(db: D1Database, elenco: T[]): Promise<(T & { ultimoContatto: number | null })[]> {
  if (elenco.length === 0) return [];
  const m = await ultimiContatti(db);
  return elenco.map((l) => ({ ...l, ultimoContatto: m.get(l.id) ?? null }));
}
