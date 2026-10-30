import { DOCUMENT_KINDS, type DocumentKind } from "../db/schema";

// Organizzazione dei documenti nella scheda (30/10/2026): regole automatiche, pure, usate dal Worker e dallo script
// che sistema i documenti già caricati. Chi carica può sempre dire tipo e call: queste valgono solo quando tace.

const AUDIO = new Set(["m4a", "mp3", "ogg", "opus", "wav", "aac"]);
const TESTO = new Set(["txt", "doc", "docx", "pdf"]);

export const tipoValido = (t: unknown): t is DocumentKind => typeof t === "string" && (DOCUMENT_KINDS as readonly string[]).includes(t);

// Tipo dal nome del file e dal titolo: audio = registrazione; "trascri..." in un testo = trascrizione;
// PDF con "preventivo" = preventivo; il resto è "altro".
export function tipoAutomatico(fileName: string, titolo?: string | null): DocumentKind {
  const est = /\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  const testo = `${titolo ?? ""} ${fileName}`.toLowerCase();
  if (AUDIO.has(est)) return "registrazione";
  if (TESTO.has(est) && /trascri/.test(testo)) return "trascrizione";
  if (est === "pdf" && /preventiv/.test(testo)) return "preventivo";
  return "altro";
}

export const vaSullaCall = (t: DocumentKind) => t === "registrazione" || t === "trascrizione";

// Data scritta nel titolo come "GG/MM" (o "GG/MM/AAAA"): quella della consulenza. Senza anno vale l'ultima
// data così che non sia nel futuro rispetto a "ora". Mezzogiorno ora italiana circa, per stare dopo una call del mattino
// solo se il giorno è quello: la call si sceglie poi con "fine giornata" (vedi callPerData).
export function dataDalTitolo(testo: string, ora: number): number | null {
  const m = /(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/.exec(testo);
  if (!m) return null;
  const g = Number(m[1]);
  const mese = Number(m[2]);
  if (g < 1 || g > 31 || mese < 1 || mese > 12) return null;
  const anno = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date(ora).getUTCFullYear();
  let t = Date.UTC(anno, mese - 1, g, 12);
  if (!m[3] && t > ora + 36 * 3600_000) t = Date.UTC(anno - 1, mese - 1, g, 12);
  return t;
}

export type CallPerScelta = { id: string; kind: string; scheduledAt: number; outcome: string | null };

// "L'ultima call fatta prima della data del file": esclude quelle saltate o rimandate e quelle dopo la data.
// Con una data presa dal titolo (solo il giorno) vale tutta la giornata: si guarda fino alle 23:59 di Roma.
export function callPerData(elenco: CallPerScelta[], data: number, soloGiorno = false): CallPerScelta | null {
  const limite = soloGiorno ? fineGiornataRoma(data) : data;
  const buone = elenco
    .filter((c) => c.outcome !== "saltata" && c.outcome !== "rimandata" && c.scheduledAt <= limite)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);
  return buone[0] ?? null;
}

function fineGiornataRoma(t: number) {
  const giorno = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  const [a, m, g] = giorno.split("-").map(Number);
  // 23:59 di Roma: al massimo UTC+2, quindi le 21:59 UTC stanno sempre dentro la giornata (in inverno è 22:59 locale, va bene).
  return Date.UTC(a, m - 1, g, 21, 59);
}
