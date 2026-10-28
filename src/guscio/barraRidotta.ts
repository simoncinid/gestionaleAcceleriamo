import { useCallback, useState } from "react";

// Blocco 1 bis: la barra laterale del computer si riduce a una colonna di icone.
// La scelta vive nel browser (localStorage), una per computer, come il selettore "Colonne": è un'abitudine.
// Default aperta. Si legge nell'inizializzatore di useState, cioè prima del primo disegno: niente sfarfallio.
export const CHIAVE_BARRA = "acceleriamo-os:barra-ridotta";

export function leggiRidotta(testo: string | null): boolean {
  return testo === "1";
}

export function testoRidotta(ridotta: boolean): string {
  return ridotta ? "1" : "0";
}

// Cmd B sul Mac, Ctrl B altrove. Niente Maiusc o Alt: Cmd Maiusc B è dei preferiti nel browser.
export function scorciatoiaBarra(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; key: string }): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b";
}

export function etichettaScorciatoia(piattaforma: string): string {
  return /mac|iphone|ipad/i.test(piattaforma) ? "⌘B" : "Ctrl+B";
}

function memoria(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function leggiBarra(): boolean {
  try { return leggiRidotta(memoria()?.getItem(CHIAVE_BARRA) ?? null); } catch { return false; }
}

export function salvaBarra(ridotta: boolean): void {
  try { memoria()?.setItem(CHIAVE_BARRA, testoRidotta(ridotta)); } catch { /* scelta valida solo per questa visita */ }
}

export function useBarraRidotta(): [boolean, (v: boolean) => void] {
  const [ridotta, setRidotta] = useState(leggiBarra);
  const cambia = useCallback((v: boolean) => { setRidotta(v); salvaBarra(v); }, []);
  return [ridotta, cambia];
}
