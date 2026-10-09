import { useId, useMemo, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { presetQuando, quando } from "../format";
import { cx } from "./cx";
import { Selettore } from "./Selettore";

export const campo = "h-12 w-full rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio px-3 text-corpo text-ink focus-visible:border-ink";

export function Campo({ etichetta, aiuto, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { etichetta: string; aiuto?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-secondaria font-medium">{etichetta}</label>
      <input id={id} {...p} className={cx(campo, className)} />
      {aiuto && <p className="text-meta text-grigio">{aiuto}</p>}
    </div>
  );
}

export function AreaTesto({ etichetta, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { etichetta: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-secondaria font-medium">{etichetta}</label>
      <textarea id={id} rows={3} {...p} className={cx(campo, "h-auto py-2", className)} />
    </div>
  );
}

const perInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

// "Quando" è un selettore: i preset di presetQuando (senza quelli già passati), poi "Altro giorno e ora" che apre il campo data e ora.
// L'istante di riferimento si congela al primo rendering: i preset relativi ("Tra 1 ora") non devono scivolare a ogni render.
export function CampoQuando({ etichetta, valore, onCambia, ora, apertoAllInizio = false }: { etichetta: string; valore: number | null; onCambia: (ms: number | null) => void; ora?: number; apertoAllInizio?: boolean }) {
  const [base] = useState(() => ora ?? Date.now());
  const preset = useMemo(() => presetQuando(base).filter((p) => p.ms > base), [base]);
  const [scelta, setScelta] = useState<string | null>(() => {
    if (valore == null) return null;
    const i = preset.findIndex((p) => p.ms === valore);
    return i >= 0 ? String(i) : "altra";
  });
  const opzioni = [...preset.map((p, i) => ({ valore: String(i), etichetta: p.etichetta })), { valore: "altra", etichetta: "Altro giorno e ora" }];
  const altra = scelta === "altra";
  return (
    <div className="flex flex-col gap-2">
      <Selettore etichetta={etichetta} opzioni={opzioni} valore={scelta} apertoAllInizio={apertoAllInizio}
        testoValore={valore != null ? quando(valore, base) : altra ? "Scegli giorno e ora" : undefined}
        onCambia={(v) => { setScelta(v); if (v !== "altra") onCambia(preset[Number(v)].ms); }} />
      {altra && (
        <input aria-label={`${etichetta}: giorno e ora`} type="datetime-local" className={campo} value={valore ? perInput(valore) : ""}
          onChange={(e) => onCambia(e.target.value ? new Date(e.target.value).getTime() : null)} />
      )}
    </div>
  );
}
