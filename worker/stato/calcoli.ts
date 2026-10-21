// Stato delle automazioni (spec 22/10/2026): calcoli puri, usati dal worker e dalla pagina Stato.

export type Colore = "verde" | "giallo" | "rosso" | "grigio";

export type VoceCalcolo = {
  attiva: boolean;
  intervalloMin: number | null;
  ultimoEsito: "ok" | "errore" | "saltato" | "spento" | null;
  ultimoGiroAt: number | null;
};

const MINUTO = 60_000;

// Tolleranza prima del giallo: metà dell'intervallo, almeno 5 minuti (un giro del cron può slittare).
export const tolleranzaMs = (intervalloMin: number) => Math.max(5, intervalloMin / 2) * MINUTO;

// Ritardo rispetto al giro atteso: 0 finché non è passato l'intervallo dall'ultima volta che si è sentita.
export function ritardoMs(v: VoceCalcolo, now: number): number {
  if (v.ultimoGiroAt == null || !v.intervalloMin) return 0;
  return Math.max(0, now - v.ultimoGiroAt - v.intervalloMin * MINUTO);
}

// Verde funziona, giallo non si sente da più del previsto, rosso l'ultimo giro è andato in errore,
// grigio spenta o mai partita. Un giro saltato per il budget non cambia il colore: conta il ritardo.
export function coloreVoce(v: VoceCalcolo, now: number): Colore {
  if (!v.attiva || v.ultimoEsito === "spento" || v.ultimoGiroAt == null) return "grigio";
  if (v.ultimoEsito === "errore") return "rosso";
  if (v.intervalloMin && ritardoMs(v, now) > tolleranzaMs(v.intervalloMin)) return "giallo";
  return "verde";
}

// Avviso (spec, sezione 3): quando la voce è rossa o resta gialla oltre il doppio dell'intervallo.
export function daAvvisare(v: VoceCalcolo, now: number): boolean {
  const c = coloreVoce(v, now);
  if (c === "rosso") return true;
  return c === "giallo" && v.intervalloMin != null && ritardoMs(v, now) > 2 * v.intervalloMin * MINUTO;
}

export function prossimoGiro(v: VoceCalcolo): number | null {
  if (v.ultimoGiroAt == null || !v.intervalloMin || !v.attiva || v.ultimoEsito === "spento") return null;
  return v.ultimoGiroAt + v.intervalloMin * MINUTO;
}

export const ETICHETTE_COLORE: Record<Colore, string> = { verde: "Funziona", giallo: "In ritardo", rosso: "Errore", grigio: "Spenta" };

// "Ogni 5 minuti", "Ogni ora", "Una volta al giorno": l'intervallo in parole.
export function intervalloInParole(min: number | null): string {
  if (!min) return "Senza intervallo";
  if (min === 10_080) return "Una volta alla settimana";
  if (min === 1440) return "Una volta al giorno";
  if (min % 1440 === 0) return `Ogni ${min / 1440} giorni`;
  if (min === 60) return "Ogni ora";
  if (min % 60 === 0) return `Ogni ${min / 60} ore`;
  return `Ogni ${min} minuti`;
}
