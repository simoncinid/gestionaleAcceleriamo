import { SOURCE_LABELS } from "../../format";

export function provenienza(l: { source: string; metaCampaign: string | null }): string {
  const campagna = l.metaCampaign ? `, campagna ${l.metaCampaign}` : "";
  if (l.source === "meta") return `Da Meta${campagna}`;
  if (l.source === "foglio_andrea") return `Dal Foglio Andrea${campagna}`;
  if (l.source === "manuale") return "Inserito a mano";
  return `Da ${SOURCE_LABELS[l.source] ?? l.source}${campagna}`;
}

// "1.800,50" diventa 180050. Vuoto o non numerico: null.
export function centesimi(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!pulito || !/^\d+(\.\d{1,2})?$/.test(pulito)) return null;
  return Math.round(Number(pulito) * 100);
}

// Riga da incollare nel frontmatter del preventivo nel wiki (spec 6.8, abbinamento per id).
export const idPerPreventivo = (id: string) => `lead: ${id}`;

// Stessa regola di worker/email/conferma.ts (MAX_TENTATIVI_CONFERMA = 4): il frontend non importa il modulo che parla con Resend.
export const MAX_TENTATIVI_CONFERMA = 4;
export const confermaNonPartita = (l: { confirmationSentAt: number | null; confirmationAttempts: number }) =>
  l.confirmationSentAt == null && l.confirmationAttempts >= MAX_TENTATIVI_CONFERMA;
