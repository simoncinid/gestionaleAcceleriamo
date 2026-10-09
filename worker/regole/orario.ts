import { daRoma, partiRoma } from "../lib/roma";

export type Orario = { giorni: number[]; inizio: string; fine: string };
export const ORARIO_DEFAULT: Orario = { giorni: [1, 2, 3, 4, 5, 6], inizio: "08:30", fine: "19:30" };

const hm = (s: string) => s.split(":").map(Number) as [number, number];

function finestra(ms: number, orario: Orario): { apre: number; chiude: number; lavora: boolean; domani: number } {
  const p = partiRoma(ms);
  const [ha, ma] = hm(orario.inizio);
  const [hc, mc] = hm(orario.fine);
  return {
    apre: daRoma(p.anno, p.mese, p.giorno, ha, ma),
    chiude: daRoma(p.anno, p.mese, p.giorno, hc, mc),
    lavora: orario.giorni.includes(p.settimana),
    domani: daRoma(p.anno, p.mese, p.giorno + 1),
  };
}

// Aggiunge minuti di lavoro a un istante, saltando notti e giorni chiusi.
export function scadenzaLavorativa(da: number, minuti: number, orario: Orario): number {
  let t = da;
  let resto = minuti * 60_000;
  for (let i = 0; i < 60; i++) {
    const f = finestra(t, orario);
    if (f.lavora && t < f.chiude) {
      const inizio = Math.max(t, f.apre);
      if (inizio + resto <= f.chiude) return inizio + resto;
      resto -= f.chiude - inizio;
    }
    t = f.domani;
  }
  return t;
}

export function minutiLavorativiTra(da: number, a: number, orario: Orario): number {
  let t = da;
  let somma = 0;
  for (let i = 0; i < 400 && t < a; i++) {
    const f = finestra(t, orario);
    if (f.lavora) somma += Math.max(0, Math.min(a, f.chiude) - Math.max(t, f.apre));
    t = f.domani;
  }
  return Math.round(somma / 60_000);
}

// "Il giorno dopo alle 10": se cade in un giorno chiuso, slitta al primo giorno di lavoro.
export function alleOre(ms: number, giorniDopo: number, ore: number, minuti: number, orario: Orario): number {
  const p = partiRoma(ms);
  for (let k = giorniDopo; k < giorniDopo + 8; k++) {
    const t = daRoma(p.anno, p.mese, p.giorno + k, ore, minuti);
    if (orario.giorni.includes(partiRoma(t).settimana)) return t;
  }
  return daRoma(p.anno, p.mese, p.giorno + giorniDopo, ore, minuti);
}
