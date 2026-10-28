import type { CallKind } from "../../../worker/db/schema";

type VoceNota = { chiave: string; etichetta: string };
// Spec 6.7: lo schema delle note dipende dal tipo di call. Si salvano come JSON in calls.notes.
// Modifica 25: analisi e progetto usano le stesse voci dell'offerta.
const NOTE_OFFERTA: VoceNota[] = [
  { chiave: "reazione", etichetta: "Reazione alla proposta" },
  { chiave: "obiezioni", etichetta: "Obiezioni" },
  { chiave: "opzione", etichetta: "Opzione che interessa (standard o proprietà del codice)" },
  { chiave: "decide", etichetta: "Chi decide e quando" },
  { chiave: "prossimo", etichetta: "Prossimo passo" },
  { chiave: "libero", etichetta: "Altro" },
];
export const NOTE_CALL: Record<CallKind, VoceNota[]> = {
  conoscenza: [
    { chiave: "giornata", etichetta: "Cosa fa durante il giorno" },
    { chiave: "problema", etichetta: "Problema principale, con le sue parole" },
    { chiave: "strumenti", etichetta: "Come lavora oggi (strumenti, fogli, persone)" },
    { chiave: "ore", etichetta: "Ore perse a settimana (stima)" },
    { chiave: "decide", etichetta: "Chi decide" },
    { chiave: "budget", etichetta: "Budget o reazione al prezzo indicativo" },
    { chiave: "libero", etichetta: "Altro" },
  ],
  offerta: NOTE_OFFERTA,
  analisi: NOTE_OFFERTA,
  progetto: NOTE_OFFERTA,
};

// Note vecchie o scritte a mano (testo semplice) finiscono in "Altro".
export function leggiNote(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, typeof x === "string" ? x : String(x ?? "")]));
    }
    return { libero: String(v) };
  } catch {
    return { libero: json };
  }
}

export const noteVuote = (json: string | null) => Object.values(leggiNote(json)).every((v) => !v.trim());
