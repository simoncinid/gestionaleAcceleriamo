// Colonna "Ultimo contatto" della tabella dei lead (contratto blocco 1, sezione 4): l'ultima volta che qualcuno
// ha parlato o scritto al lead. Contano chiamate e messaggi avviati, esiti, email e call; non contano note,
// cambi di fase ed eventi automatici. Una sola query raggruppata per tutto l'elenco.
export const TIPI_CONTATTO = ["chiamata", "contatto", "esito", "email", "call"] as const;

export async function ultimiContatti(db: D1Database): Promise<Map<string, number>> {
  const segnaposto = TIPI_CONTATTO.map(() => "?").join(", ");
  const r = await db
    .prepare(`SELECT a.lead_id AS leadId, max(a.created_at) AS ultimo FROM activities a JOIN leads l ON l.id = a.lead_id
      WHERE l.deleted_at IS NULL AND a.type IN (${segnaposto}) GROUP BY a.lead_id`)
    .bind(...TIPI_CONTATTO)
    .all<{ leadId: string; ultimo: number }>();
  return new Map(r.results.map((x) => [x.leadId, x.ultimo]));
}

export async function conUltimoContatto<T extends { id: string }>(db: D1Database, elenco: T[]): Promise<(T & { ultimoContatto: number | null })[]> {
  if (elenco.length === 0) return [];
  const m = await ultimiContatti(db);
  return elenco.map((l) => ({ ...l, ultimoContatto: m.get(l.id) ?? null }));
}
