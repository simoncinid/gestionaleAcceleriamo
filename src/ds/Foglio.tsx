import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Pulsante } from "./Pulsante";

export const PRIMO_CAMPO = "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role=switch], button[aria-expanded]";

type Bersaglio = { isConnected: boolean; focus: () => void } | null | undefined;

// Dove torna il fuoco alla chiusura: al `ritorno` indicato da chi apre il foglio (per esempio "Altre azioni" quando il
// pulsante vero stava in un altro foglio, già chiuso), altrimenti a chi aveva il fuoco all'apertura. Solo se è nella pagina.
export function doveTorna<T extends Bersaglio>(ritorno: T, prima: T): T | null {
  if (ritorno?.isConnected) return ritorno;
  return prima?.isConnected ? prima : null;
}

export function Foglio({ aperto, titolo, onChiudi, principale, ritorno, children }: {
  aperto: boolean; titolo: string; onChiudi: () => void; principale?: ReactNode;
  /** Pulsante che riceve il fuoco alla chiusura, se diverso da chi aveva il fuoco all'apertura. */
  ritorno?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const prima = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperto && !d.open) {
      prima.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      // Voce 43: il fuoco va al primo campo, non su "Annulla"; senza campi resta il comportamento del browser.
      corpo.current?.querySelector<HTMLElement>(PRIMO_CAMPO)?.focus();
    }
    if (!aperto && d.open) { d.close(); doveTorna(ritorno?.current, prima.current)?.focus(); prima.current = null; }
  }, [aperto]);
  // Un foglio montato solo quando serve sparisce senza passare da aperto=false: il fuoco torna lo stesso a chi l'ha aperto.
  // Il fuoco torna al giro dopo e solo se il dialog è davvero uscito dalla pagina: durante la pulizia può essere ancora
  // modale (pagina inerte) e lo StrictMode smonta per finta una volta all'apertura (QA Task 15, controlli 19 e 30).
  useEffect(() => {
    const d = ref.current;
    return () => {
      const p = prima.current;
      setTimeout(() => { if (d && !d.isConnected) doveTorna(ritorno?.current, p)?.focus(); }, 0);
    };
  }, []);
  return (
    <dialog ref={ref} onClose={onChiudi} onClick={(e) => e.target === ref.current && onChiudi()} aria-labelledby={id}
      className="m-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-t-blocco bg-avorio text-ink shadow-galleggiante backdrop:bg-ink/40 md:m-auto md:w-[480px] md:rounded-blocco open:animate-[sale_var(--durata-foglio)_var(--ease-foglio)] md:open:animate-[appare_var(--durata-foglio)_var(--ease-foglio)]">
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-sabbia-2 md:hidden" aria-hidden />
      <header className="flex items-center justify-between px-4 pt-3">
        <h2 id={id} className="font-display text-titolo-card">{titolo}</h2>
        <Pulsante variante="fantasma" onClick={onChiudi}>Annulla</Pulsante>
      </header>
      <div ref={corpo} className="flex flex-col gap-4 overflow-y-auto px-4 py-4">{aperto && children}</div>
      {principale && <footer className="border-t border-sabbia px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">{principale}</footer>}
    </dialog>
  );
}
