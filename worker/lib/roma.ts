// Calendario sul fuso di Roma: SLA, cron, mesi e date mostrate passano tutti da qui.
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export type PartiRoma = { anno: number; mese: number; giorno: number; ore: number; minuti: number; settimana: number };

export function partiRoma(ms: number): PartiRoma {
  const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
  const anno = Number(p.year);
  const mese = Number(p.month);
  const giorno = Number(p.day);
  return { anno, mese, giorno, ore: Number(p.hour), minuti: Number(p.minute), settimana: new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay() };
}

function scarto(ms: number) {
  const p = partiRoma(ms);
  return Date.UTC(p.anno, p.mese - 1, p.giorno, p.ore, p.minuti) - ms;
}

// Il giorno può sforare il mese (31 + 1): Date.UTC lo riporta al mese dopo.
export function daRoma(anno: number, mese: number, giorno: number, ore = 0, minuti = 0): number {
  const finto = Date.UTC(anno, mese - 1, giorno, ore, minuti);
  const primo = finto - scarto(finto);
  return finto - scarto(primo);
}

export const numeroGiorno = (p: { anno: number; mese: number; giorno: number }) => Date.UTC(p.anno, p.mese - 1, p.giorno) / 86_400_000;

export function meseRoma(ms: number) {
  const p = partiRoma(ms);
  return `${p.anno}-${String(p.mese).padStart(2, "0")}`;
}

export function inizioGiornoRoma(ms: number) {
  const p = partiRoma(ms);
  return daRoma(p.anno, p.mese, p.giorno);
}
