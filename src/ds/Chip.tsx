import type { ReactNode } from "react";
import { cx } from "./cx";

// Solo per tag e segmenti fissi da 2-3 voci: per le scelte lunghe c'è il Selettore.
export function Chip({ selezionato, conteggio, onClick, children }: { selezionato?: boolean; conteggio?: number; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selezionato ?? false} onClick={onClick}
      className={cx("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pillola px-4 text-secondaria font-medium transition-colors duration-(--durata-veloce)",
        selezionato ? "bg-ink text-avorio" : "bg-crema text-ink hover:bg-sabbia")}>
      <span>{children}</span>
      {conteggio != null && <span className="tabular-nums">{conteggio}</span>}
    </button>
  );
}
