import { CaretDown } from "@phosphor-icons/react";
import { cx } from "../../ds";
import type { Stage } from "../../types";
import { coloreFase } from "./coloriLead";

// Blocco 1 bis: la fase ha un aspetto solo in tutto il gestionale (tabella, scheda, Oggi, filtro, fogli).
// Seconda passata: un colore per ogni fase, dall'id (mappa in coloriLead.ts): sfondo tinta solida, bordo da 1 px
// nel colore pieno, testo nel colore pieno scurito. Alta 24 px, niente pallino.

// Id e nome di una fase dall'elenco; se la fase non c'è (dati vecchi) resta l'id, in grigio.
export function faseDi(fasi: Stage[] | undefined, id: string): { id: string; label: string } {
  const f = fasi?.find((x) => x.id === id);
  return { id, label: f?.label ?? id };
}

export function EtichettaFase({ id, label, freccia = false, className }: { id: string; label: string; freccia?: boolean; className?: string }) {
  const c = coloreFase(id);
  return (
    <span title={label} style={{ backgroundColor: c.sfondo, borderColor: c.pieno, color: c.testo }}
      className={cx("inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-[6px] border px-2 text-[13px] font-medium leading-4", className)}>
      <span className="min-w-0 truncate">{label}</span>
      {freccia && <CaretDown size={11} weight="bold" aria-hidden className="shrink-0 opacity-70" />}
    </span>
  );
}
