import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { stageRules } from "../db/schema";
import { leggiImpostazioni } from "../impostazioni/service";
import { scadenzaLavorativa, type Orario } from "./orario";

// Fase dei lead appena arrivati: la loro prossima azione è la prima chiamata, con lo SLA.
export const FASE_PRIMA_CHIAMATA = "da-chiamare-prima-volta";

export type Sla = { minuti: number; orario: Orario };

// Minuti della regola SLA (Impostazioni > Fasi e regole) e orario di apertura.
export async function leggiSla(db: Db): Promise<Sla> {
  const [imp, regola] = await Promise.all([
    leggiImpostazioni(db),
    db.select({ params: stageRules.params }).from(stageRules).where(and(eq(stageRules.ruleKey, "sla"), eq(stageRules.active, true))).get(),
  ]);
  let minuti = 120;
  try {
    const v = (JSON.parse(String(regola?.params ?? "{}")) as Record<string, unknown>).minuti;
    if (typeof v === "number") minuti = v;
  } catch {
    // Parametri illeggibili: resta il valore di base.
  }
  return { minuti, orario: imp.orario };
}

// Unica scadenza della prima chiamata (spec 6.4): lo SLA conta solo i minuti di apertura,
// quindi un lead arrivato di notte scade dopo la riapertura, non "da 60 ore".
export function scadenzaPrimaChiamata(createdAt: number, sla: Sla): number {
  return scadenzaLavorativa(createdAt, sla.minuti, sla.orario);
}

// Una data scelta a mano (rimanda, modifica) vince; la data di base (l'arrivo, o nessuna)
// diventa la scadenza della prima chiamata. Così Oggi, Scaletta, Elenco e scheda leggono lo stesso valore.
export function conScadenzaSla<T extends { stageId: string; createdAt: number; nextActionAt: number | null }>(lead: T, sla: Sla): T {
  if (lead.stageId !== FASE_PRIMA_CHIAMATA) return lead;
  if (lead.nextActionAt != null && lead.nextActionAt > lead.createdAt) return lead;
  return { ...lead, nextActionAt: scadenzaPrimaChiamata(lead.createdAt, sla) };
}
