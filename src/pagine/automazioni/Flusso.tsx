import { ArrowsClockwise, CaretDown, Database, Envelope, Clock, Gear, MapPin, PaperPlaneTilt, Shuffle, Sparkle, Table, UsersThree } from "@phosphor-icons/react";
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

type Principale = { p: AutomationStep; n: number; rami: { p: AutomationStep; sigla: string }[] };

// La numerazione segue l'ordine principale. Un ramo (passaggio con etichetta sulla linea) sta sotto il passaggio principale che lo precede e prende la sigla 6a, 6b...
export function ordinaFlusso(passi: AutomationStep[]): { principali: Principale[]; sigle: Map<string, string> } {
  const principali: Principale[] = [];
  const sigle = new Map<string, string>();
  for (const p of passi) {
    const ultimo = principali[principali.length - 1];
    if (p.branch && ultimo) {
      const sigla = `${ultimo.n}${String.fromCharCode(97 + ultimo.rami.length)}`;
      ultimo.rami.push({ p, sigla });
      sigle.set(p.id, sigla);
    } else {
      principali.push({ p, n: principali.length + 1, rami: [] });
      sigle.set(p.id, String(principali.length));
    }
  }
  return { principali, sigle };
}

// Il passo del battito ("dove") indica il passaggio rotto: per numero o sigla ("3", "6a") o per titolo, senza maiuscole.
export const ePassoRotto = (passo: string | null | undefined, p: AutomationStep, sigla: string) => {
  const t = passo?.trim().toLowerCase();
  return Boolean(t) && (t === sigla || t === p.title.trim().toLowerCase());
};

function Blocco({ p, sigla, ramo, rotto, onApri }: { p: AutomationStep; sigla: string; ramo?: boolean; rotto?: string | null; onApri: (p: AutomationStep) => void }) {
  const Icona = iconaDi(p.icon);
  const qui = ePassoRotto(rotto, p, sigla);
  return (
    <button type="button" onClick={() => onApri(p)} aria-label={`Passaggio ${sigla}: ${p.title}${qui ? ". Si è fermata qui" : ""}. Apri il dettaglio tecnico`}
      className={cx("flex min-h-11 w-full flex-col gap-2 rounded-blocco border bg-avorio p-4 text-left hover:bg-crema", qui ? "border-[1.5px] border-errore" : ramo ? "border-dashed border-sabbia-2" : "border-sabbia")}>
      <span className="flex items-center gap-2">
        <span className={cx("inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-etichetta font-semibold tabular-nums", ramo ? "border-[1.5px] border-ink text-ink" : "bg-ink text-avorio")}>{sigla}</span>
        <Icona size={22} weight="regular" aria-hidden />
      </span>
      <span className="text-testo font-semibold">{p.title}</span>
      <span className="text-nota text-grigio">{p.summary}</span>
      {qui && <span className="text-nota font-medium text-errore">Si è fermata qui</span>}
    </button>
  );
}

// Una colonna sola, a ogni larghezza: i passaggi principali uniti da una linea con freccia; ogni ramo spostato a destra, sotto il passaggio da cui parte, con linea tratteggiata e la sua etichetta.
export function Flusso({ passi, onApri, rotto }: { passi: AutomationStep[]; onApri: (p: AutomationStep) => void; rotto?: string | null }) {
  const { principali } = ordinaFlusso(passi);
  return (
    <ol aria-label="Flusso dell'automazione" className="flex max-w-[720px] flex-col">
      {principali.map(({ p, n, rami }, i) => (
        <li key={p.id} className="flex flex-col">
          {i > 0 && (
            <div aria-hidden className="flex h-9 flex-col items-start pl-[26px] text-ink">
              <span className="w-px flex-1 bg-ink" />
              <CaretDown size={14} weight="bold" className="-ml-[6px] -mt-1" />
            </div>
          )}
          <Blocco p={p} sigla={String(n)} rotto={rotto} onApri={onApri} />
          {rami.map(({ p: r, sigla }) => (
            <div key={r.id} className="ml-[26px] flex flex-col sm:ml-12">
              <div aria-hidden className="flex h-9 items-center gap-3">
                <span className="h-full w-0 border-l-2 border-dashed border-ink/60" />
                <span className="text-nota text-ink">{r.branch}</span>
              </div>
              <Blocco p={r} sigla={sigla} ramo rotto={rotto} onApri={onApri} />
              <p className="pt-2 text-nota text-grigio">{i + 1 < principali.length ? `Poi si torna al passaggio ${n + 1}` : "Il flusso finisce qui"}</p>
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

function Voce({ etichetta, children }: { etichetta: string; children?: string | null }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-sabbia py-3 last:border-0">
      <dt className="text-etichetta uppercase text-grigio">{etichetta}</dt>
      <dd className="text-testo break-words">{children}</dd>
    </div>
  );
}

// Dettaglio tecnico di un passaggio: foglio dal basso sul telefono, pannello laterale sul computer. Un'informazione per riga.
export function FoglioPasso({ passo, numero, onChiudi }: { passo: AutomationStep; numero: string; onChiudi: () => void }) {
  return (
    <Foglio aperto lato titolo={`${numero}. ${passo.title}`} onChiudi={onChiudi}>
      <p className="text-testo">{passo.summary}</p>
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
