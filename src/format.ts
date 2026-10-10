import { daRoma, inizioGiornoRoma, numeroGiorno, partiRoma } from "../worker/lib/roma";

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

// Q13: quando è arrivato un lead. Oggi e ieri con l'ora, poi solo giorno e mese ("3 ott").
export function arrivato(ms: number, ora = Date.now()): string {
  const diff = numeroGiorno(partiRoma(ora)) - numeroGiorno(partiRoma(ms));
  if (diff === 0) return `oggi ${hhmm(partiRoma(ms))}`;
  if (diff === 1) return `ieri ${hhmm(partiRoma(ms))}`;
  const p = partiRoma(ms);
  const anno = p.anno !== partiRoma(ora).anno ? ` ${p.anno}` : "";
  return `${p.giorno} ${MESI[p.mese - 1]}${anno}`;
}

export function trascorso(ms: number, ora = Date.now()): string {
  const d = ora - ms;
  if (d < MIN) return "adesso";
  if (d < ORA_MS) return `${Math.floor(d / MIN)} min fa`;
  if (d < GIORNO_MS) return `${Math.floor(d / ORA_MS)} h fa`;
  const giorni = Math.floor(d / GIORNO_MS);
  return giorni === 1 ? "1 giorno fa" : `${giorni} giorni fa`;
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
  return `${cents < 0 && n > 0 ? "-" : ""}€ ${testo}`;
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

// Data di inizio di un contratto (chiusura vinta): giorni interi, a mezzanotte di Roma. Mai preset da richiamo.
export function presetInizio(ora = Date.now()) {
  const p = partiRoma(ora);
  const finoALunedi = (8 - p.settimana) % 7 || 7;
  return [
    { etichetta: "Oggi", ms: daRoma(p.anno, p.mese, p.giorno) },
    { etichetta: "Lunedì prossimo", ms: daRoma(p.anno, p.mese, p.giorno + finoALunedi) },
    { etichetta: "Primo del mese prossimo", ms: daRoma(p.anno, p.mese + 1, 1) },
  ];
}

// Scorciatoie per i giorni passati (Segna incassata, Segna emessa): voce 48.
export function presetPassato(ora = Date.now()) {
  const p = partiRoma(ora);
  return [
    { etichetta: "Oggi", ms: daRoma(p.anno, p.mese, p.giorno) },
    { etichetta: "Ieri", ms: daRoma(p.anno, p.mese, p.giorno - 1) },
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

// "il 15 ott", ma "l'8 ott" e "l'11 ott" (QA del Piano A): anche "dal" e "al" si elidono ("dall'8", "all'11").
const ELISO = { il: "l'", dal: "dall'", al: "all'" } as const;
export function ilGiorno(ms: number, ora = Date.now(), prep: keyof typeof ELISO = "il"): string {
  const g = partiRoma(ms).giorno;
  return `${g === 8 || g === 11 ? ELISO[prep] : `${prep} `}${giorno(ms, ora)}`;
}
export const conArticolo = (prep: keyof typeof ELISO, numeroDelGiorno: number, resto: string) =>
  `${numeroDelGiorno === 8 || numeroDelGiorno === 11 ? ELISO[prep] : `${prep} `}${resto}`;

// QA 16: scadenza di una fattura contata in giorni di Roma, non in ore UTC.
// "scade oggi", "scade domani", "scaduta da N giorni", altrimenti "scade il 15 ott" (con l'apostrofo per 8 e 11).
export function scadenzaFattura(dueAt: number, ora = Date.now()): string {
  const giorni = Math.round((inizioGiornoRoma(dueAt) - inizioGiornoRoma(ora)) / 86_400_000);
  if (giorni === 0) return "scade oggi";
  if (giorni === 1) return "scade domani";
  if (giorni < 0) return `scaduta da ${-giorni} ${giorni === -1 ? "giorno" : "giorni"}`;
  return `scade ${ilGiorno(dueAt, ora)}`;
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

// Percentuale onesta già calcolata dal server: null diventa "n.d." (meno di 5 lead).
export const percentualeOppureNd = (p: number | null) => (p == null ? "n.d." : `${p}%`);

// Mese di Roma corrente e i precedenti, per il Selettore di Campagne ("ottobre 2026").
export function mesiRecenti(ora: number, quanti: number): { valore: string; etichetta: string }[] {
  const [a, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(ora).split("-").map(Number);
  return Array.from({ length: quanti }, (_, i) => {
    const t = a * 12 + (m - 1) - i;
    const valore = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
    return { valore, etichetta: nomeMese(valore) };
  });
}

// Soldi in centesimi con due decimali, per i costi delle campagne: "€ 38,00", "€ 1.234,50".
export function euroCentesimi(cents?: number | null): string {
  if (cents == null) return "";
  const n = Math.abs(Math.round(cents));
  const interi = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}€ ${interi},${String(n % 100).padStart(2, "0")}`;
}

// Importo scritto a mano in euro ("532", "532,40", "1.234,50", "€ 12.5") in centesimi interi; null se non è un importo.
export function centesimiDaTesto(testo: string): number | null {
  let s = testo.replace(/[€\s]/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [interi, decimali = ""] = s.split(".");
  return Number(interi) * 100 + Number(decimali.padEnd(2, "0"));
}
