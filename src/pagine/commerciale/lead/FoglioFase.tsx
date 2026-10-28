import { Check } from "@phosphor-icons/react";
import { Foglio } from "../../../ds";
import type { Stage } from "../../../types";
import { callPerFase } from "../../../../worker/regole/fasi-call";
import { EtichettaFase } from "../EtichettaFase";

// Foglio del cambio fase, aperto dalla pillola dell'intestazione: le fasi una per riga, con la loro etichetta colorata.
// Scegliere una fase che chiede data o motivo apre il foglio giusto; la fase attuale è spuntata e non fa niente.
// "scegli" arriva da useCambioFase della scheda: il salvataggio (e il suo "Annulla") vive oltre la chiusura del foglio.
export function FoglioFase({ attuale, ordinate, scegli, onChiudi }: {
  attuale: string; ordinate: Stage[]; scegli: (id: string) => void; onChiudi: () => void;
}) {
  return (
    <Foglio aperto lato titolo="Cambia fase" onChiudi={onChiudi}>
      <ul role="listbox" aria-label="Fase" className="flex flex-col">
        {ordinate.map((f) => (
          <li key={f.id} role="none">
            <button type="button" role="option" aria-selected={f.id === attuale}
              onClick={() => {
                // Le fasi con un foglio loro lo aprono al posto di questo; le altre si salvano e il foglio si chiude.
                if (f.id === attuale) return onChiudi();
                const serveFoglio = f.requiresReason || f.kind === "won" || !!callPerFase(f.id);
                scegli(f.id);
                if (!serveFoglio) onChiudi();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[15px] hover:bg-crema focus-visible:bg-crema">
              <span className="flex min-w-0 flex-1"><EtichettaFase id={f.id} label={f.label} /></span>
              <span className="flex w-5 justify-end">{f.id === attuale && <Check size={18} weight="bold" aria-hidden />}</span>
            </button>
          </li>
        ))}
      </ul>
    </Foglio>
  );
}
