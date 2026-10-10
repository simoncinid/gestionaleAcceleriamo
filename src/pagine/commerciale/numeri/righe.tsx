import type { ReactNode } from "react";
import { Punto, cx } from "../../../ds";

// Un gruppo di righe in un blocco avorio: titolo a sinistra, meta a destra, nota facoltativa sotto (prototipo 19).
export function Gruppo({ titolo, meta, nota, children }: { titolo: string; meta?: string; nota?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 break-words font-display text-titolo-blocco">{titolo}</h2>
        {meta && <span className="text-meta text-grigio tabular-nums">{meta}</span>}
      </div>
      <ul className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">{children}</ul>
      {nota && <p className="text-meta text-grigio">{nota}</p>}
    </section>
  );
}

// Barra sottile della quota (0-100): una sola serie, grigia su binario sabbia; arancione solo per il dato in evidenza.
// Il valore è già scritto nella riga, quindi la barra è decorativa per chi usa un lettore di schermo.
function Barra({ quota, evidenza }: { quota: number; evidenza?: boolean }) {
  const larghezza = Math.max(0, Math.min(100, quota));
  return (
    <span data-barra aria-hidden className={cx("mt-1.5 block h-1 w-full overflow-hidden rounded-full", evidenza ? "bg-tinta" : "bg-sabbia")}>
      <span
        className={cx("block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out", evidenza ? "bg-accento" : "bg-grigio-2")}
        style={{ width: `${larghezza}%` }}
      />
    </span>
  );
}

// Voce 19 e 20 dell'addendum: il nome va a capo anche senza spazi, il numero ("€ 1.950 su € 2.000") resta su una riga.
// Una riga: nome a sinistra, numero a destra, dettaglio sotto il nome; punto colorato e barra solo dove servono.
export function Voce({ nome, numero, dettaglio, punto, etichettaPunto, quota, evidenza }: {
  nome: string; numero: string | number; dettaglio?: string; punto?: "verde" | "giallo" | "rosso" | "grigio"; etichettaPunto?: string;
  quota?: number | null; evidenza?: boolean;
}) {
  return (
    <li className="flex min-h-14 items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-corpo">{punto && <Punto colore={punto} etichetta={etichettaPunto ?? nome} />}<span className="min-w-0 [overflow-wrap:anywhere]">{nome}</span></span>
        {dettaglio && <span className="text-secondaria text-grigio tabular-nums">{dettaglio}</span>}
        {quota != null && <Barra quota={quota} evidenza={evidenza} />}
      </div>
      {numero !== "" && <span className="shrink-0 whitespace-nowrap text-corpo font-semibold tabular-nums">{numero}</span>}
    </li>
  );
}

// Una riga di intestazione dentro un gruppo ("Per inserzione").
export function Sottotitolo({ children }: { children: ReactNode }) {
  return <li className="px-4 pb-1 pt-3 text-meta text-grigio">{children}</li>;
}
