import { daRoma, numeroGiorno, partiRoma } from "../worker/lib/roma";
const TZ = "Europe/Rome";

export const fmtDateTime = (ms?: number | null) =>
  ms ? new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms) : "";

export const fmtDate = (ms?: number | null) =>
  ms ? new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(ms) : "";

export const fmtEuro = (n?: number | null) =>
  n == null ? "" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function fmtDuration(ms?: number | null) {
  if (ms == null) return "n.d.";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} ${Math.floor(hours / 24) === 1 ? "giorno" : "giorni"} ${hours % 24} h`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toInput(ms?: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function dayBounds(now = new Date()) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const until = new Date(now);
  until.setHours(23, 59, 59, 999);
  return { from: from.getTime(), until: until.getTime(), now: now.getTime() };
}

export function relative(ms: number) {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  return `${days} giorni fa`;
}

export const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta", manuale: "A mano", sito: "Sito", passaparola: "Passaparola", altro: "Altro", migrazione: "Vecchio gestionale",
};

export const TONE_CLASSES: Record<string, string> = {
  orange: "bg-brand/15 text-brand",
  neutral: "bg-ink/10 text-ink/70",
  yellow: "bg-amber-100 text-amber-800",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
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
