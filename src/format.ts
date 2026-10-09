import { daRoma, numeroGiorno, partiRoma } from "../worker/lib/roma";

export const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta", manuale: "A mano", sito: "Sito", passaparola: "Passaparola", altro: "Altro", migrazione: "Vecchio gestionale", foglio_andrea: "Foglio Andrea",
};

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MIN = 60_000;
const ORA_MS = 3_600_000;
const GIORNO_MS = 86_400_000;

const hhmm = (p: { ore: number; minuti: number }) => `${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`;

function durata(ms: number) {
  if (ms < ORA_MS) return `${Math.max(1, Math.floor(ms / MIN))} min`;
  if (ms < GIORNO_MS) return `${Math.floor(ms / ORA_MS)} h`;
  const g = Math.floor(ms / GIORNO_MS);
  return g === 1 ? "1 giorno" : `${g} giorni`;
}

function dataBreve(ms: number, ora: number, conSettimana: boolean) {
  const p = partiRoma(ms);
  const anno = p.anno !== partiRoma(ora).anno ? ` ${p.anno}` : "";
  const giorno = conSettimana ? `${GIORNI[p.settimana]} ` : "";
  return `${giorno}${p.giorno} ${MESI[p.mese - 1]}${anno}, ${hhmm(p)}`;
}

// Unica funzione per le date future e scadute (DS 2.2).
export function quando(ms?: number | null, ora = Date.now()): string {
  if (ms == null) return "";
  if (ms < ora) return `scaduta da ${durata(ora - ms)}`;
  const diff = numeroGiorno(partiRoma(ms)) - numeroGiorno(partiRoma(ora));
  if (diff === 0) return `oggi ${hhmm(partiRoma(ms))}`;
  if (diff === 1) return `domani ${hhmm(partiRoma(ms))}`;
  return dataBreve(ms, ora, diff <= 6);
}

// Momento nello storico: oggi, ieri, poi giorno e data.
export function momento(ms: number, ora = Date.now()): string {
  const diff = numeroGiorno(partiRoma(ora)) - numeroGiorno(partiRoma(ms));
  if (diff === 0) return `oggi ${hhmm(partiRoma(ms))}`;
  if (diff === 1) return `ieri ${hhmm(partiRoma(ms))}`;
  return dataBreve(ms, ora, true);
}

export function trascorso(ms: number, ora = Date.now()): string {
  const d = ora - ms;
  if (d < MIN) return "adesso";
  if (d < ORA_MS) return `${Math.floor(d / MIN)} min fa`;
  if (d < GIORNO_MS) return `${Math.floor(d / ORA_MS)} h fa`;
  return `${Math.floor(d / GIORNO_MS)} giorni fa`;
}

export function fermoDa(ms: number, ora = Date.now()): string | null {
  const g = Math.floor((ora - ms) / GIORNO_MS);
  if (g < 7) return null;
  return g > 60 ? `fermo da ${Math.floor(g / 30)} mesi` : `fermo da ${g} giorni`;
}

// Soldi in centesimi, mostrati senza decimali: "€ 1.800".
export function euro(cents?: number | null): string {
  if (cents == null) return "";
  const n = Math.round(Math.abs(cents) / 100);
  const testo = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}€ ${testo}`;
}

export const conteggioBadge = (n: number) => (n <= 0 ? null : n > 9 ? "9+" : String(n));

export const percentuale = (parte: number, totale: number) => (totale < 5 ? "n.d." : `${Math.round((parte / totale) * 100)}%`);

export function telefonoMostrato(e164?: string | null): string {
  if (!e164) return "";
  const m = /^\+39(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+39 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export const linkTel = (e164: string) => `tel:${e164}`;

export const linkWhatsApp = (e164: string, testo?: string) =>
  `https://wa.me/${e164.replace(/^\+/, "")}${testo ? `?text=${encodeURIComponent(testo)}` : ""}`;

export const riempiModello = (testo: string, valori: Record<string, string | null | undefined>) =>
  testo.replace(/\{(\w+)\}/g, (_, k: string) => valori[k] ?? "");

export function presetQuando(ora = Date.now()) {
  const p = partiRoma(ora);
  return [
    { etichetta: "Tra 1 ora", ms: ora + ORA_MS },
    { etichetta: "Oggi 18:00", ms: daRoma(p.anno, p.mese, p.giorno, 18, 0) },
    { etichetta: "Domani 10:00", ms: daRoma(p.anno, p.mese, p.giorno + 1, 10, 0) },
    { etichetta: "Tra 3 giorni", ms: daRoma(p.anno, p.mese, p.giorno + 3, 10, 0) },
  ];
}

// Minuti interi in ore e minuti ("1 h 10 min"): diversa da durata(), che arrotonda all'unità più grande.
const durataMinuti = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

// Timer delle 2 ore sui lead nuovi (spec 6.4).
export function testoSla(scadenza: number, ora = Date.now()): string {
  const minuti = Math.round((scadenza - ora) / 60_000);
  return minuti >= 0 ? `mancano ${durataMinuti(minuti)}` : `scaduto da ${durataMinuti(-minuti)}`;
}

const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const due = (n: number) => String(n).padStart(2, "0");

// Giorno senza ora (scadenze, date promesse): "15 nov", con l'anno solo se diverso.
export function giorno(ms: number, ora = Date.now()): string {
  const p = partiRoma(ms);
  return `${p.giorno} ${MESI[p.mese - 1]}${p.anno !== partiRoma(ora).anno ? ` ${p.anno}` : ""}`;
}

// Valore per <input type="date">, sul fuso di Roma.
export function isoGiorno(ms: number): string {
  const p = partiRoma(ms);
  return `${p.anno}-${due(p.mese)}-${due(p.giorno)}`;
}

// Da <input type="date"> a ms: mezzogiorno di Roma, lontano da ogni cambio di giorno.
export function daIsoGiorno(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? daRoma(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0) : null;
}

export function nomeMese(mese: string): string {
  const [anno, m] = mese.split("-").map(Number);
  return `${MESI_LUNGHI[m - 1]} ${anno}`;
}
