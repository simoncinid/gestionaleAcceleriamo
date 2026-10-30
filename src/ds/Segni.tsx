import type { ReactNode } from "react";
import { conteggioBadge } from "../format";
import { cx } from "./cx";

export function Badge({ n }: { n: number }) {
  const t = conteggioBadge(n);
  if (!t) return null;
  return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accento px-1.5 text-etichetta font-semibold text-accento-inchiostro tabular-nums">{t}</span>;
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

// Voce 49: la chip resta su una riga ("in attesa di attivazione" in Canoni), è il titolo accanto ad andare a capo.
export const Tag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-sabbia px-2.5 text-etichetta text-ink">{children}</span>
);

// piccolo: dentro una card (chi segue il lead), alto come una riga di meta.
export const Avatar = ({ nome, piccolo = false }: { nome: string; piccolo?: boolean }) => (
  <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-accento font-display font-semibold text-accento-inchiostro", piccolo ? "size-6 text-nota" : "size-9 text-testo")} aria-hidden>
    {nome.trim().charAt(0).toUpperCase()}
  </span>
);
