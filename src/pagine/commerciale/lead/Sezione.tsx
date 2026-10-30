import { useId, type ReactNode } from "react";
import { cx } from "../../../ds";
import { SECONDARIO, SEZIONE, TITOLO_SEZIONE } from "./stile";

// Una sezione della scheda: contenitore bianco con titolo; "destra" tiene un conteggio o un link a testo.
export function Sezione({ titolo, destra, children, className, nome }: {
  titolo: string; destra?: ReactNode; children: ReactNode; className?: string; nome?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-sezione={nome} className={cx(SEZIONE, className)}>
      <header className="flex min-h-6 items-end justify-between gap-3">
        <h2 id={id} className={TITOLO_SEZIONE}>{titolo}</h2>
        {destra}
      </header>
      {children}
    </section>
  );
}

// Una riga etichetta e valore, dentro un <dl>: etichetta grigia a sinistra, valore a capo se lungo (mai puntini).
export function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="grid min-h-11 grid-cols-[minmax(96px,128px)_minmax(0,1fr)] items-center gap-3 py-2">
      <dt className={SECONDARIO}>{etichetta}</dt>
      <dd className="min-w-0 break-words text-testo leading-6 tabular-nums">{children}</dd>
    </div>
  );
}
