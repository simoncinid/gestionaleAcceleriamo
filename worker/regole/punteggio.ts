export type RegolaPunteggio = { campo: string; operatore: "contiene" | "non_contiene" | "presente"; valore: string; punti: number };
export type Punteggio = "verde" | "giallo" | "grigio";

export function datiPerPunteggio(lead: { email?: string | null; website?: string | null; phone?: string | null; company?: string | null; metaAnswers?: string | null }): Record<string, string | null> {
  let risposte: Record<string, unknown> = {};
  try {
    risposte = lead.metaAnswers ? JSON.parse(lead.metaAnswers) : {};
  } catch {
    risposte = {};
  }
  const extra = Object.fromEntries(Object.entries(risposte).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v == null ? null : String(v)]));
  return { ...extra, email: lead.email ?? null, website: lead.website ?? null, phone: lead.phone ?? null, company: lead.company ?? null };
}

// Spec 6.3: due punti o più verde, uno giallo, zero grigio. Un campo vuoto non dà punti.
export function calcolaPunteggio(dati: Record<string, string | null | undefined>, regole: RegolaPunteggio[]): Punteggio {
  let punti = 0;
  for (const r of regole) {
    const v = (dati[r.campo] ?? "").toString().toLowerCase().trim();
    if (!v) continue;
    const cerca = r.valore.toLowerCase();
    const vale = r.operatore === "presente" || (r.operatore === "contiene" ? v.includes(cerca) : !v.includes(cerca));
    if (vale) punti += r.punti;
  }
  return punti >= 2 ? "verde" : punti === 1 ? "giallo" : "grigio";
}
