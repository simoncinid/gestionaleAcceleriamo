import { Clock } from "@phosphor-icons/react";
import { Contatto, Pulsante } from "../../ds";
import { momento, quando } from "../../format";
import type { VoceAdesso } from "../../types";
import { avviaContatto } from "./chiamata";
import { PulsanteRimanda } from "./RigaOggi";

// DS 6.5: il blocco arancione in cima a Oggi. Il suo primo pulsante è l'unica azione primaria della pagina.
export function BloccoAdesso({ voce, ora, onEsito, onRimanda }: { voce: VoceAdesso; ora: number; onEsito: () => void; onRimanda: () => void }) {
  return (
    <section aria-label="Adesso" className="flex flex-col gap-1 rounded-blocco bg-accento p-5 text-accento-inchiostro md:p-6">
      <p className="text-eyebrow uppercase">Adesso</p>
      <p className="font-display text-titolo-blocco text-avorio">{voce.company}</p>
      {voce.contactName && <p className="text-corpo">{voce.contactName}</p>}
      {voce.tipo === "lead" ? (
        <>
          <p className="mt-2 flex items-center gap-2 text-corpo font-semibold">
            <Clock size={20} weight="bold" aria-hidden className="shrink-0" />
            {voce.nextAction ?? "Prima chiamata"}
          </p>
          {voce.nextActionAt != null && <p className="text-corpo font-semibold tabular-nums">{quando(voce.nextActionAt, ora)}</p>}
          <p className="text-secondaria">Fase: {voce.stageLabel}</p>
          <div className="mt-4 flex items-center gap-2">
            <Contatto tipo="chiama" lead={voce} variante="su-accento" misura="lg" onAvvio={() => avviaContatto(voce.id, "chiamata")} />
            <Pulsante variante="secondario" misura="lg" className="shrink-0" onClick={onEsito}>Esito</Pulsante>
            <PulsanteRimanda suAccento onClick={onRimanda} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-corpo font-semibold">Call di {voce.kind}</p>
          <p className="text-corpo font-semibold tabular-nums">{momento(voce.scheduledAt, ora)}</p>
          <div className="mt-4 flex">
            <Contatto tipo="meet" lead={voce} variante="su-accento" misura="lg" />
          </div>
        </>
      )}
    </section>
  );
}
