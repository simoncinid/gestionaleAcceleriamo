import type { Fee } from "../db/schema";
import { inizioGiornoRoma } from "../lib/roma";

export type StatoFattura = "in_ritardo" | "emessa" | "da_emettere" | "incassata";
export type StatoCliente = "attivo" | "in_costruzione" | "in_pausa" | "cessato";
export type AzioneCanone = "attiva" | "pausa" | "riprendi" | "cessa";

export const ETICHETTE_CANONE: Record<Fee["status"], string> = { in_attesa: "in attesa di attivazione", attivo: "attivo", in_pausa: "in pausa", cessato: "cessato" };
export const ETICHETTE_FATTURA: Record<StatoFattura, string> = { in_ritardo: "In ritardo", emessa: "Emesse", da_emettere: "Da emettere", incassata: "Incassate" };
export const ETICHETTE_TIPO_FATTURA = { acconto: "Acconto", saldo: "Saldo", canone: "Canone", extra: "Extra" } as const;
export const ETICHETTE_COSTO = { strumenti: "Strumenti", costi_vivi: "Costi vivi", altro: "Altro" } as const;
export const ETICHETTE_AUTOMAZIONE = { in_costruzione: "In costruzione", attiva: "Attiva", in_pausa: "In pausa", dismessa: "Dismessa" } as const;
export const ETICHETTE_CLIENTE: Record<StatoCliente, string> = { attivo: "Attivo", in_costruzione: "In costruzione", in_pausa: "In pausa", cessato: "Cessato" };

// Le cinque famiglie di lavoro (wiki di Acceleriamo, crescita, casi di intervento).
export const FAMIGLIE = [
  { valore: "documenti", etichetta: "Leggere e riscrivere documenti" },
  { valore: "risposte", etichetta: "Rispondere ai clienti" },
  { valore: "agende", etichetta: "Organizzare giri e agende" },
  { valore: "solleciti", etichetta: "Sollecitare chi non fa" },
  { valore: "riepiloghi", etichetta: "Riepilogare per chi decide" },
] as const;
export type Famiglia = (typeof FAMIGLIE)[number]["valore"];
export const etichettaFamiglia = (f: string | null) => FAMIGLIE.find((x) => x.valore === f)?.etichetta ?? "Famiglia da scegliere";

// Spec 9.3: "in ritardo" non si salva, si calcola dalla scadenza passata senza incasso.
// La scadenza vale per tutto il suo giorno di Roma: in ritardo solo dal giorno dopo.
export function statoFattura(f: { issuedAt: number | null; dueAt: number | null; paidAt: number | null }, now: number): StatoFattura {
  if (f.paidAt != null) return "incassata";
  if (f.issuedAt == null) return "da_emettere";
  if (f.dueAt != null && f.dueAt < inizioGiornoRoma(now)) return "in_ritardo";
  return "emessa";
}

// Spec 6.10. Un cliente appena creato, senza canoni né automazioni, conta come in costruzione: "cessato" sarebbe falso.
export function statoCliente(canoni: { status: string }[], automazioni: { status: string }[]): StatoCliente {
  if (canoni.some((c) => c.status === "attivo") || automazioni.some((a) => a.status === "attiva")) return "attivo";
  if (automazioni.some((a) => a.status === "in_costruzione") || canoni.some((c) => c.status === "in_attesa")) return "in_costruzione";
  if (canoni.some((c) => c.status === "in_pausa")) return "in_pausa";
  if (!canoni.length && !automazioni.length) return "in_costruzione";
  return "cessato";
}

const PASSAGGI: Record<AzioneCanone, { da: Fee["status"][]; verbo: string; campi: (now: number) => Partial<Fee> }> = {
  attiva: { da: ["in_attesa"], verbo: "attivare", campi: (now) => ({ status: "attivo", startAt: now }) },
  pausa: { da: ["attivo"], verbo: "mettere in pausa", campi: (now) => ({ status: "in_pausa", pausedAt: now }) },
  riprendi: { da: ["in_pausa"], verbo: "riprendere", campi: () => ({ status: "attivo", pausedAt: null }) },
  cessa: { da: ["in_attesa", "attivo", "in_pausa"], verbo: "cessare", campi: (now) => ({ status: "cessato", endAt: now }) },
};

export function prossimoStatoCanone(stato: Fee["status"], azione: AzioneCanone, now: number): { campi: Partial<Fee> } | { errore: string } {
  const p = PASSAGGI[azione];
  if (!p.da.includes(stato)) return { errore: `Il canone è ${ETICHETTE_CANONE[stato]}: non si può ${p.verbo}` };
  return { campi: p.campi(now) };
}

// Spec 10.1: "Un'agenzia immobiliare di Pisa". Il settore si scrive come lo si direbbe, con l'articolo.
export function descrizioneAnonima(settore: string | null, citta: string | null): string {
  const s = settore?.trim() || "un cliente";
  const testo = s.charAt(0).toUpperCase() + s.slice(1);
  return citta?.trim() ? `${testo} di ${citta.trim()}` : testo;
}
