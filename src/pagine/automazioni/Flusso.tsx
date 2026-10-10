import { ArrowsClockwise, CaretDown, CaretRight, Database, Envelope, Clock, Gear, MapPin, PaperPlaneTilt, Shuffle, Sparkle, Table, UsersThree } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { cx, Foglio, Selettore, type Opzione } from "../../ds";
import type { AutomationStep } from "../../types";

type Icona = ComponentType<{ size?: number; weight?: "bold" | "regular"; "aria-hidden"?: boolean; className?: string }>;
export const ICONE: Record<string, { Icona: Icona; etichetta: string }> = {
  database: { Icona: Database, etichetta: "Archivio dati" },
  envelope: { Icona: Envelope, etichetta: "Email" },
  clock: { Icona: Clock, etichetta: "Orario" },
  sparkle: { Icona: Sparkle, etichetta: "Intelligenza artificiale" },
  mappin: { Icona: MapPin, etichetta: "Luogo" },
  users: { Icona: UsersThree, etichetta: "Persone" },
  shuffle: { Icona: Shuffle, etichetta: "Scelta" },
  table: { Icona: Table, etichetta: "Foglio" },
  paperplane: { Icona: PaperPlaneTilt, etichetta: "Invio" },
  arrows: { Icona: ArrowsClockwise, etichetta: "Ripetizione" },
  gear: { Icona: Gear, etichetta: "Altro" },
};
export const OPZIONI_ICONA: Opzione<string>[] = Object.entries(ICONE).map(([valore, v]) => ({ valore, etichetta: v.etichetta }));
const iconaDi = (nome: string | null) => (nome && ICONE[nome]?.Icona) || Gear;

// Il flusso: passaggi uno sotto l'altro sul telefono, in orizzontale a capo sul computer largo. Un passaggio di ramo ha il tratteggio e l'etichetta sulla linea.
export function Flusso({ passi, onApri }: { passi: AutomationStep[]; onApri: (p: AutomationStep) => void }) {
  return (
    <ol aria-label="Flusso dell'automazione" className="flex flex-col items-stretch lg:flex-row lg:flex-wrap lg:items-stretch lg:gap-y-4">
      {passi.map((p, i) => {
        const Icona = iconaDi(p.icon);
        return (
          <li key={p.id} className="flex flex-col lg:flex-row lg:items-center">
            {i > 0 && (
              <div aria-hidden className={cx("flex items-center justify-center gap-2 self-center text-grigio", "min-h-9 flex-row lg:min-h-0 lg:w-24 lg:flex-col", !p.branch && "lg:w-10")}>
                {p.branch && <span className="max-w-[240px] text-center text-meta text-ink lg:max-w-24">{p.branch}</span>}
                <CaretDown size={20} weight="bold" className="lg:hidden" />
                <CaretRight size={20} weight="bold" className="hidden lg:block" />
              </div>
            )}
            <button type="button" onClick={() => onApri(p)} aria-label={`Passaggio ${i + 1}: ${p.title}. Apri il dettaglio tecnico`}
              className={cx("flex h-full w-full min-h-11 flex-col gap-2 rounded-blocco border bg-avorio p-4 text-left hover:bg-crema lg:w-[210px]", p.branch ? "border-dashed border-sabbia-2" : "border-sabbia")}>
              <span className="flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-ink text-etichetta font-semibold tabular-nums text-avorio">{i + 1}</span>
                <Icona size={22} weight="regular" aria-hidden />
              </span>
              <span className="text-corpo font-semibold">{p.title}</span>
              <span className="text-secondaria text-grigio">{p.summary}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Voce({ etichetta, children }: { etichetta: string; children?: string | null }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-sabbia py-3 last:border-0">
      <dt className="text-etichetta uppercase text-grigio">{etichetta}</dt>
      <dd className="text-corpo break-words">{children}</dd>
    </div>
  );
}

// Dettaglio tecnico di un passaggio: foglio dal basso sul telefono, pannello laterale sul computer. Un'informazione per riga.
export function FoglioPasso({ passo, numero, onChiudi }: { passo: AutomationStep; numero: number; onChiudi: () => void }) {
  return (
    <Foglio aperto lato titolo={`${numero}. ${passo.title}`} onChiudi={onChiudi}>
      <p className="text-corpo">{passo.summary}</p>
      <dl>
        <Voce etichetta="Strumento o servizio">{passo.tool}</Voce>
        <Voce etichetta="Quando parte">{passo.trigger}</Voce>
        <Voce etichetta="Cosa riceve">{passo.receives}</Voce>
        <Voce etichetta="Cosa produce">{passo.produces}</Voce>
        <Voce etichetta="Dove gira">{passo.runsOn}</Voce>
        <Voce etichetta="Cosa può andare storto">{passo.risks}</Voce>
        <Voce etichetta="Dato">{passo.confirmed ? "Confermato" : "Da confermare con Diego"}</Voce>
      </dl>
    </Foglio>
  );
}

export { Selettore };
