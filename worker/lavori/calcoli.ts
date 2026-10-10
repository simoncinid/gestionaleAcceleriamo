import { daRoma, meseRoma, partiRoma } from "../lib/roma";

export const GIORNO_MS = 86_400_000;

export type TaskModello = { id: string; title: string; recurrence: "una_tantum" | "ricorrente"; assigneeId: string | null; dueDays: number | null; monthDay: number | null };

// Scadenza di una task una tantum: la data di avvio più i giorni del modello, a mezzanotte di Roma (il passaggio all'ora legale non sposta il giorno).
export function scadenzaUnaTantum(avvio: number, giorni: number): number {
  const p = partiRoma(avvio + giorni * GIORNO_MS + 12 * 3_600_000);
  return daRoma(p.anno, p.mese, p.giorno);
}

// Le ricorrenti partono dal mese dell'avvio se l'avvio è il primo del mese, altrimenti dal mese dopo.
export function primoMeseRicorrenti(avvio: number): string {
  const p = partiRoma(avvio);
  if (p.giorno === 1) return meseRoma(avvio);
  return p.mese === 12 ? `${p.anno + 1}-01` : `${p.anno}-${String(p.mese + 1).padStart(2, "0")}`;
}

// Le task di un lavoro tipo che la creazione genera subito.
export function taskIniziali(modelli: TaskModello[], avvio: number) {
  return modelli.filter((m) => m.recurrence === "una_tantum").map((m) => ({ modello: m, dueAt: scadenzaUnaTantum(avvio, m.dueDays ?? 0) }));
}

// Scadenza di una ricorrente nel mese "AAAA-MM": il giorno del modello a mezzanotte di Roma.
export function scadenzaRicorrente(mese: string, giorno: number): number {
  const [a, m] = mese.split("-").map(Number);
  return daRoma(a, m, giorno);
}

// Una ricorrente va creata se il lavoro è partito (mese corrente >= mese di inizio) e oggi è il giorno indicato o dopo.
export function ricorrenteDovuta(oggi: number, daMese: string | null, giorno: number): boolean {
  if (!daMese) return false;
  const p = partiRoma(oggi);
  return meseRoma(oggi) >= daMese && p.giorno >= giorno;
}

export const TIPI_LAVORO = {
  una_tantum: "Una tantum",
  una_tantum_ricorrente: "Una tantum e ricorrente",
  ricorrente: "Ricorrente",
} as const;

// Un lavoro tipo ammette solo le task del suo tipo.
export function ammette(kind: keyof typeof TIPI_LAVORO, recurrence: "una_tantum" | "ricorrente"): boolean {
  return kind === "una_tantum_ricorrente" || kind === recurrence;
}

// Gruppo di una task aperta nell'elenco "Da fare".
export function gruppoTask(dueAt: number | null, oggi: number): "in_ritardo" | "questa_settimana" | "piu_avanti" {
  const p = partiRoma(oggi);
  const inizioOggi = daRoma(p.anno, p.mese, p.giorno);
  if (dueAt != null && dueAt < inizioOggi) return "in_ritardo";
  const giorniAllaDomenica = (7 - p.settimana) % 7;
  const fineSettimana = inizioOggi + (giorniAllaDomenica + 1) * GIORNO_MS;
  if (dueAt != null && dueAt < fineSettimana) return "questa_settimana";
  return "piu_avanti";
}
