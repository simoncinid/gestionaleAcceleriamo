import { useLayoutEffect, useState } from "react";

// Vista a colonne della Scaletta sul computer: quante colonne intere stanno nell'area e quanto è larga ognuna.
// Si mostrano sempre colonne intere (mai una a metà): le altre si raggiungono scorrendo di lato, una colonna per scatto.
export const COLONNA_MIN = 280;
export const COLONNA_MAX = 420;
export const SPAZIO = 16;

export function misuraColonne(larghezza: number, quante: number): { visibili: number; colonna: number } {
  if (larghezza <= 0 || quante <= 0) return { visibili: 1, colonna: COLONNA_MIN };
  const stanno = Math.max(1, Math.floor((larghezza + SPAZIO) / (COLONNA_MIN + SPAZIO)));
  const visibili = Math.min(stanno, quante);
  const colonna = Math.min(COLONNA_MAX, Math.floor((larghezza - SPAZIO * (visibili - 1)) / visibili));
  return { visibili, colonna };
}

// Altezza: dal punto in cui parte il tavolo fino in fondo alla finestra, meno il margine sotto.
const MARGINE_SOTTO = 24;
const ALTEZZA_MIN = 360;

export function useTavolo(quante: number) {
  // Ref a callback: il tavolo compare solo dopo il caricamento e solo nella vista a colonne.
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [misure, setMisure] = useState<{ altezza: number; colonna: number } | null>(null);
  const [bordi, setBordi] = useState({ prima: false, dopo: false });
  useLayoutEffect(() => {
    if (!el) return;
    const aggiorna = () => {
      const stile = getComputedStyle(el);
      const interna = el.clientWidth - parseFloat(stile.paddingLeft) - parseFloat(stile.paddingRight);
      const alto = el.getBoundingClientRect().top + window.scrollY;
      const altezza = Math.max(ALTEZZA_MIN, Math.floor(window.innerHeight - alto - MARGINE_SOTTO));
      const { colonna } = misuraColonne(interna, quante);
      setMisure((m) => (m && m.altezza === altezza && m.colonna === colonna ? m : { altezza, colonna }));
      leggiBordi();
    };
    // Ci sono colonne nascoste a sinistra o a destra? Accende le frecce.
    const leggiBordi = () => {
      const prima = el.scrollLeft > 1;
      const dopo = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setBordi((b) => (b.prima === prima && b.dopo === dopo ? b : { prima, dopo }));
    };
    aggiorna();
    el.addEventListener("scroll", leggiBordi, { passive: true });
    // Cambia con la finestra e con ciò che sta sopra (il campo di ricerca che si apre, il banner).
    const oss = new ResizeObserver(aggiorna);
    oss.observe(el);
    if (el.parentElement) oss.observe(el.parentElement);
    window.addEventListener("resize", aggiorna);
    return () => { oss.disconnect(); window.removeEventListener("resize", aggiorna); el.removeEventListener("scroll", leggiBordi); };
  }, [el, quante]);
  // Una colonna per volta: chi usa il mouse senza rotella laterale ci arriva con le frecce.
  const scorri = (verso: 1 | -1) => {
    if (!el || !misure) return;
    const fermo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: verso * (misure.colonna + SPAZIO), behavior: fermo ? "auto" : "smooth" });
  };
  return { ref, misure, bordi, scorri };
}
