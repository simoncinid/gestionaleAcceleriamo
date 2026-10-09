import { cx } from "./cx";

// Interruttore acceso/spento: una riga da 56 px con l'etichetta a sinistra e la levetta a destra.
// Acceso è in accento (stato scelto, come la fase selezionata), mai un pulsante: non conta come primario.
export function Interruttore({ etichetta, acceso, onCambia, aiuto }: { etichetta: string; acceso: boolean; onCambia: (v: boolean) => void; aiuto?: string }) {
  return (
    <button type="button" role="switch" aria-checked={acceso} onClick={() => onCambia(!acceso)}
      className="flex min-h-14 w-full items-center gap-3 rounded-blocco border border-sabbia bg-avorio px-4 py-2 text-left hover:bg-crema">
      <span className="min-w-0 flex-1">
        <span className="block text-corpo font-semibold">{etichetta}</span>
        {aiuto && <span className="block text-meta text-grigio">{aiuto}</span>}
      </span>
      <span aria-hidden className={cx("relative h-8 w-13 shrink-0 rounded-full motion-safe:transition-colors", acceso ? "bg-accento" : "bg-sabbia-2")}>
        <span className={cx("absolute top-1 left-1 size-6 rounded-full bg-avorio shadow-sm motion-safe:transition-transform", acceso && "translate-x-5")} />
      </span>
    </button>
  );
}
