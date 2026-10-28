import { and, asc, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { calls, proposals, type CallKind } from "../db/schema";
import { callPerFase } from "../regole/fasi-call";
import { contestoRegole } from "../impostazioni/service";
import { leggiSla } from "../regole/sla";
import { prossimaAzione, type LeadPerProcesso, type ProssimaAzione, type RegoleProcesso } from "./processo";

// Parametri della funzione unica letti dalle Impostazioni (orario, minuti della prima chiamata, tentativi).
export async function leggiRegoleProcesso(db: Db, adesso: number): Promise<RegoleProcesso> {
  const [sla, ctx] = await Promise.all([leggiSla(db), contestoRegole(db, adesso)]);
  return { orario: sla.orario, minutiPrimaChiamata: sla.minuti, massimoTentativi: ctx.massimoTentativi };
}

export type ConProssima<T> = T & { prossima: ProssimaAzione };

// Aggiunge a ogni lead la riga "Da fare" calcolata dalla funzione unica, con i dati che le servono
// (call in programma e proposte) letti in due query per tutto l'elenco.
export async function conProssima<T extends LeadPerProcesso & { id: string }>(db: Db, elenco: T[], adesso: number, regole?: RegoleProcesso): Promise<ConProssima<T>[]> {
  if (elenco.length === 0) return [];
  const r = regole ?? (await leggiRegoleProcesso(db, adesso));
  const ids = elenco.map((l) => l.id);
  const aperte: { leadId: string; kind: CallKind; scheduledAt: number; meetLink: string | null }[] = [];
  const conProposta = new Set<string>();
  // D1 accetta al massimo 100 parametri per query: si legge a pezzi.
  for (let i = 0; i < ids.length; i += 90) {
    const pezzo = ids.slice(i, i + 90);
    const [k, p] = await Promise.all([
      db.select({ leadId: calls.leadId, kind: calls.kind, scheduledAt: calls.scheduledAt, meetLink: calls.meetLink }).from(calls)
        .where(and(inArray(calls.leadId, pezzo), isNull(calls.deletedAt), isNull(calls.outcome))).orderBy(asc(calls.scheduledAt)),
      db.select({ leadId: proposals.leadId }).from(proposals).where(and(inArray(proposals.leadId, pezzo), isNull(proposals.deletedAt))),
    ]);
    aperte.push(...k);
    for (const x of p) if (x.leadId) conProposta.add(x.leadId);
  }
  return elenco.map((l) => {
    const mie = aperte.filter((k) => k.leadId === l.id);
    // La call della fase (30, 40, 45, 55) dà il link; quella dell'offerta serve alla scadenza in 35.
    const inCorso = mie.find((k) => k.kind === (callPerFase(l.stageId) ?? "conoscenza"));
    const offerta = mie.find((k) => k.kind === "offerta");
    const prossima = prossimaAzione({
      ...l, meetLink: inCorso?.meetLink ?? null, haProposta: conProposta.has(l.id), offertaAt: offerta?.scheduledAt ?? null,
    }, adesso, r);
    return { ...l, prossima };
  });
}
