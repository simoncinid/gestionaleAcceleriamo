import { useEffect, useId, useRef, type ReactNode } from "react";
import { Pulsante } from "./Pulsante";

export function Foglio({ aperto, titolo, onChiudi, principale, children }: { aperto: boolean; titolo: string; onChiudi: () => void; principale?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperto && !d.open) d.showModal();
    if (!aperto && d.open) d.close();
  }, [aperto]);
  return (
    <dialog ref={ref} onClose={onChiudi} onClick={(e) => e.target === ref.current && onChiudi()} aria-labelledby={id}
      className="m-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-t-blocco bg-avorio text-ink shadow-galleggiante backdrop:bg-ink/40 md:m-auto md:w-[480px] md:rounded-blocco open:animate-[sale_var(--durata-foglio)_var(--ease-foglio)] md:open:animate-[appare_var(--durata-foglio)_var(--ease-foglio)]">
      <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-sabbia-2 md:hidden" aria-hidden />
      <header className="flex items-center justify-between px-4 pt-3">
        <h2 id={id} className="font-display text-titolo-card">{titolo}</h2>
        <Pulsante variante="fantasma" onClick={onChiudi}>Annulla</Pulsante>
      </header>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">{aperto && children}</div>
      {principale && <footer className="border-t border-sabbia px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">{principale}</footer>}
    </dialog>
  );
}
