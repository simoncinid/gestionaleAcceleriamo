import type { ReactNode } from "react";

// Una riga di sola lettura: etichetta a sinistra, valore a destra. Va dentro un <dl>.
export function Dato({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <dt className="text-etichetta uppercase text-grigio">{etichetta}</dt>
      <dd className="min-w-0 truncate text-right text-testo tabular-nums">{children}</dd>
    </div>
  );
}
