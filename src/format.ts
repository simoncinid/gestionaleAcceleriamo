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
  return `${Math.floor(hours / 24)} giorni ${hours % 24} h`;
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
