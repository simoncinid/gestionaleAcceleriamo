import type { Lead } from "../../../types";

// Risposte del modulo Meta come coppie [domanda, risposta], domanda leggibile ("quante_persone" diventa "quante persone").
export function leggiRisposte(metaAnswers: string | null): [string, string][] {
  if (!metaAnswers) return [];
  try {
    return Object.entries(JSON.parse(metaAnswers) as Record<string, string>).map(([k, v]) => [k.replace(/_/g, " "), String(v)]);
  } catch {
    return [];
  }
}

export const contaRisposte = (lead: Pick<Lead, "metaAnswers">): number => leggiRisposte(lead.metaAnswers).length;
