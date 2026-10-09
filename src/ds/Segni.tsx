import type { ReactNode } from "react";
import { conteggioBadge } from "../format";
import { cx } from "./cx";

export function Badge({ n }: { n: number }) {
  const t = conteggioBadge(n);
  if (!t) return null;
  return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pillola bg-accento px-1.5 text-etichetta font-semibold text-accento-inchiostro tabular-nums">{t}</span>;
}

const COLORI = { verde: "bg-successo", giallo: "bg-attenzione", grigio: "bg-grigio", rosso: "bg-errore", accento: "bg-accento" };

export function Punto({ colore, etichetta }: { colore: keyof typeof COLORI; etichetta: string }) {
  return (
    <span className="inline-flex items-center">
      <span className={cx("size-2.5 rounded-full", COLORI[colore])} aria-hidden />
      <span className="sr-only">{etichetta}</span>
    </span>
  );
}

export const Tag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-6 items-center rounded-pillola bg-sabbia px-2.5 text-etichetta text-ink">{children}</span>
);

export const Avatar = ({ nome }: { nome: string }) => (
  <span className="inline-flex size-9 items-center justify-center rounded-full bg-accento font-display text-corpo font-semibold text-accento-inchiostro" aria-hidden>
    {nome.trim().charAt(0).toUpperCase()}
  </span>
);
