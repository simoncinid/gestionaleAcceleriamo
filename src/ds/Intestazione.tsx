import type { ReactNode } from "react";

export function Intestazione({ titolo, numero, coda, eyebrow, children }: { titolo: string; numero?: number | string; coda?: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 pb-4">
      {eyebrow && <p className="text-etichetta uppercase text-grigio">{eyebrow}</p>}
      <h1 className="font-display text-titolo-pagina">
        {titolo}{numero != null && <>, <strong className="text-accento tabular-nums">{numero}</strong> {coda}</>}
      </h1>
      {children}
    </header>
  );
}
