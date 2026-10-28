import type { NumeriSettimana } from "../lunedi/calcolo";
import { chiamaClaude, ErroreClaude } from "./client";
import { usoVuoto } from "./costo";
import { accorcia } from "../lib/testo";
import type { DefTipo } from "./coda";

const SISTEMA = `Sei il socio che legge i numeri commerciali della settimana di Acceleriamo (automazioni su misura per PMI).
Scrivi al massimo dieci righe in italiano, del tu a Tommaso e Diego, frasi brevi, senza lineette lunghe e senza elenchi puntati:
cosa è andato, cosa è fermo, cosa decidere. Usa solo i numeri del blocco <numeri>: non inventarne altri. Se un numero è basso
dillo senza giri di parole. Le decisioni già scritte stanno nel blocco <decisioni>: commentale se servono.`;

// Spec 7.3: ingresso = numeri già calcolati. Niente nomi di aziende, niente ricorrente o canoni.
export function ingressoCommento(n: NumeriSettimana, decisioni: string[]): string {
  const righe = [
    `Lead arrivati: ${n.arrivati}`,
    ...n.perFonte.map((f) => `Lead da ${f.source}: ${f.n}`),
    `Costo per lead del mese: ${n.costoPerLeadCents == null ? "non calcolabile" : `${(n.costoPerLeadCents / 100).toFixed(2)} euro`}`,
    `Call di conoscenza fatte: ${n.conoscenza}`,
    `Call dell'offerta fatte: ${n.offerta}`,
    `Call di analisi fatte: ${n.analisi}`,
    `Call del progetto fatte: ${n.progetto}`,
    `Proposte mandate: ${n.proposte}`,
    `Clienti chiusi: ${n.vinti}`,
    `Lead fermi: ${n.fermi.length}`,
    `Proposte senza risposta da oltre 14 giorni: ${n.proposteFerme.length}`,
  ];
  const d = decisioni.filter((x) => x.trim()).map((x, i) => `${i + 1}. ${x.trim()}`);
  return `<numeri>\n${righe.join("\n")}\n</numeri>\n<decisioni>\n${d.length ? d.join("\n") : "nessuna"}\n</decisioni>`;
}

const MAX_TOKENS = 600;
const MAX_RIGHE = 10;
const MAX_CARATTERI = 1_500;

// Dieci righe al massimo, niente lineette lunghe (diventano virgole), niente righe vuote in fondo.
export function pulisciCommento(testo: string): string {
  const righe = testo.replace(/\s*[\u2013\u2014]\s*/g, ", ").trim().split("\n").map((r) => r.trimEnd()).slice(0, MAX_RIGHE);
  return accorcia(righe.join("\n").trim(), MAX_CARATTERI);
}

export const TIPO_COMMENTO: DefTipo = {
  stima: (imp) => ({ modello: imp.modelli.commento, ingresso: 1_500, maxTokens: MAX_TOKENS, ricerche: 0 }),
  // Query: lettura della revisione e salvataggio del commento (2), nessuna in alErrore. Sottorichieste: una.
  async esegui(env, job, imp) {
    const r = await env.DB.prepare("SELECT numeri, decisioni FROM weekly_reviews WHERE id = ?1").bind(job.entityId).first<{ numeri: string; decisioni: string }>();
    if (!r) return { uso: usoVuoto(), modello: imp.modelli.commento }; // revisione sparita: niente chiamata
    const risposta = await chiamaClaude(env, {
      modello: imp.modelli.commento,
      sistema: SISTEMA,
      testo: ingressoCommento(JSON.parse(r.numeri) as NumeriSettimana, JSON.parse(r.decisioni) as string[]),
      maxTokens: MAX_TOKENS,
    });
    // Dopo una chiamata riuscita ogni errore porta uso e modello veri (contratto in tipi.ts).
    try {
      const testo = pulisciCommento(risposta.testo);
      if (!testo) throw new Error("Commento vuoto");
      await env.DB.prepare("UPDATE weekly_reviews SET commento = ?1, updated_at = ?2 WHERE id = ?3").bind(testo, Date.now(), job.entityId).run();
    } catch (e) {
      throw new ErroreClaude((e as Error).message, risposta.uso, risposta.modello, false);
    }
    return { uso: risposta.uso, modello: risposta.modello };
  },
  // Lo stato dell'errore lo legge la rotta da ai_jobs: la revisione non cambia.
  async alErrore() {},
};
