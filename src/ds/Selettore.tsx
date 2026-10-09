import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Foglio } from "./Foglio";

export type Opzione<T extends string> = { valore: T; etichetta: string; meta?: string };

const OLTRE_IL_FOGLIO = 8;

// Chiuso: una riga da 48 px (di più solo se il valore va a capo). Aperto: opzioni da 44 px sotto la riga, o in un foglio se sono più di otto.
// L'ordine delle opzioni è quello che passa chi lo usa: frequenza d'uso, o l'ordine del processo per le fasi.
export function Selettore<T extends string>({ etichetta, opzioni, valore, onCambia, segnaposto = "Scegli", testoValore, apertoAllInizio = false }: {
  etichetta: string; opzioni: Opzione<T>[]; valore: T | null; onCambia: (v: T) => void; segnaposto?: string; testoValore?: string; apertoAllInizio?: boolean;
}) {
  const [aperto, setAperto] = useState(apertoAllInizio);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const riportaFuoco = useRef(false);
  const nelFoglio = opzioni.length > OLTRE_IL_FOGLIO;
  // Il fuoco si sposta dopo il rendering: nel foglio il dialog si chiude prima (effetto del figlio), poi la riga torna attiva.
  const chiudi = () => { riportaFuoco.current = true; setAperto(false); };
  useEffect(() => {
    if (!aperto && riportaFuoco.current) { riportaFuoco.current = false; trigger.current?.focus(); }
    if (aperto && !nelFoglio) (contenitore.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? contenitore.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }, [aperto, nelFoglio]);
  // Frecce, Home e Fine spostano il fuoco tra le opzioni; Esc chiude e riporta il fuoco sulla riga.
  const tasti = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && aperto) { e.stopPropagation(); return chiudi(); }
    const voci = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    const i = voci.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const verso = e.key === "ArrowDown" ? (i + 1) % voci.length : e.key === "ArrowUp" ? (i - 1 + voci.length) % voci.length : e.key === "Home" ? 0 : e.key === "End" ? voci.length - 1 : null;
    if (verso == null) return;
    e.preventDefault();
    voci[verso].focus();
  };
  const scelta = opzioni.find((o) => o.valore === valore);
  const mostrato = testoValore ?? scelta?.etichetta;
  const elenco = (
    <ul id={id} role="listbox" aria-label={etichetta} className="flex flex-col">
      {opzioni.map((o) => (
        <li key={o.valore} role="none">
          <button type="button" role="option" aria-selected={o.valore === valore} onClick={() => { onCambia(o.valore); chiudi(); }}
            className="flex min-h-11 w-full items-center gap-3 rounded-controllo px-3 py-2 text-left text-corpo hover:bg-crema focus-visible:bg-crema">
            <span className="min-w-0 flex-1 break-words">{o.etichetta}</span>
            {o.meta && <span className="text-meta text-grigio tabular-nums">{o.meta}</span>}
            <span className="flex w-5 justify-end">{o.valore === valore && <Check data-spunta size={18} weight="bold" aria-hidden className="text-ink" />}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div ref={contenitore} data-selettore={etichetta} onKeyDown={tasti} className="rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio">
      <button ref={trigger} type="button" aria-expanded={aperto} aria-controls={id} onClick={() => setAperto((a) => !a)}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
        <span className="shrink-0 text-secondaria font-medium">{etichetta}</span>
        {/* Niente puntini: un valore lungo va a capo e la riga cresce (QA 11, testi tagliati). */}
        <span className={cx("min-w-0 flex-1 break-words text-right text-corpo", !mostrato && "text-grigio")}>{mostrato ?? segnaposto}</span>
        <CaretDown size={18} weight="bold" aria-hidden className={cx("shrink-0 motion-safe:transition-transform", aperto && !nelFoglio && "rotate-180")} />
      </button>
      {nelFoglio
        ? <Foglio aperto={aperto} titolo={etichetta} onChiudi={() => setAperto(false)}>{elenco}</Foglio>
        : aperto && <div className="border-t border-sabbia p-1">{elenco}</div>}
    </div>
  );
}
