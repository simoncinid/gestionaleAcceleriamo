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
  const grezzo = testo.replace(/[€\s]/g, "");
  // Un solo punto con una o due cifre in fondo e nessuna virgola ("1234.5", "150.50") è il decimale;
  // altrimenti il punto separa le migliaia ("1.234", "1.234,50").
  const puntoDecimale = !grezzo.includes(",") && /^\d+\.\d{1,2}$/.test(grezzo);
  const pulito = puntoDecimale ? grezzo : grezzo.replace(/\./g, "").replace(",", ".");
  if (!pulito || !/^\d+(\.\d{1,2})?$/.test(pulito)) return null;
  return Math.round(Number(pulito) * 100);
}

// Riga da incollare nel frontmatter del preventivo nel wiki (spec 6.8, abbinamento per id).
export const idPerPreventivo = (id: string) => `lead: ${id}`;

// Stessa regola di worker/email/conferma.ts (MAX_TENTATIVI_CONFERMA = 4): il frontend non importa il modulo che parla con Resend.
export const MAX_TENTATIVI_CONFERMA = 4;
export const confermaNonPartita = (l: { confirmationSentAt: number | null; confirmationAttempts: number }) =>
  l.confirmationSentAt == null && l.confirmationAttempts >= MAX_TENTATIVI_CONFERMA;

// 250000 diventa "2.500", 180050 diventa "1.800,50": il formato che si scrive nei campi in euro.
export function euroPerCampo(cents: number | null | undefined): string {
  if (cents == null) return "";
  const interi = String(Math.floor(Math.abs(cents) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const resto = Math.abs(cents) % 100;
  return `${cents < 0 ? "-" : ""}${interi}${resto ? `,${String(resto).padStart(2, "0")}` : ""}`;
}

type PropostaPerChiusura = { status: string; option: string; setupCents: number | null; feeCents: number | null };

// Q6: il foglio di Chiuso parte dalla proposta accettata; senza proposta usa i soldi già scritti sul lead.
// Il nome del cliente parte dall'azienda.
export function precompilaChiusura(
  lead: { company: string; setupCents: number | null; feeCents: number | null },
  proposte: PropostaPerChiusura[] = [],
): { setup: string; canone: string; nome: string } {
  const accettata = proposte.find((p) => p.status === "accettata");
  if (accettata) {
    const canone = accettata.option === "proprieta" ? 0 : accettata.feeCents;
    return { setup: euroPerCampo(accettata.setupCents), canone: euroPerCampo(canone), nome: lead.company };
  }
  return { setup: euroPerCampo(lead.setupCents), canone: euroPerCampo(lead.feeCents), nome: lead.company };
}
