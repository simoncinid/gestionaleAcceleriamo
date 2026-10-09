import type { MessageTemplate } from "../../../worker/db/schema";
import { riempiModello } from "../../format";

const primoNome = (nome: string | null) => nome?.trim().split(/\s+/)[0] ?? null;

// PV3: il modello del canale giusto, prima quello della fase del lead, poi il ripiego dello stesso canale.
export function modelloPer(modelli: MessageTemplate[] | undefined, canale: "whatsapp" | "email", stageId: string | null, ripiego: string) {
  const delCanale = (modelli ?? []).filter((m) => m.channel === canale);
  return delCanale.find((m) => stageId != null && m.stageId === stageId) ?? delCanale.find((m) => m.key === ripiego);
}

// Tutti i modelli di un canale, per il foglio Scrivi: quelli della fase del lead in cima, poi l'ordine dato.
export function modelliDelCanale(modelli: MessageTemplate[] | undefined, canale: "whatsapp" | "email", stageId: string | null) {
  const delCanale = (modelli ?? []).filter((m) => m.channel === canale);
  return [...delCanale.filter((m) => stageId != null && m.stageId === stageId), ...delCanale.filter((m) => stageId == null || m.stageId !== stageId)];
}

// PV3: un solo modo di compilare i modelli, con riempiModello e i segnaposto { referente, azienda, numero }.
export const compila = (testo: string | null | undefined, v: { contactName: string | null; company: string; numero?: string }) =>
  testo ? riempiModello(testo, { referente: primoNome(v.contactName), azienda: v.company, numero: v.numero }) : undefined;
