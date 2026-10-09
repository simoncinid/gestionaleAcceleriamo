import { useId } from "react";

// Casella "Manda l'invito": una riga da 48 px, spenta (con il motivo) se manca l'email del referente.
export function CasellaInvito({ attiva, onCambia, senzaEmail = false }: { attiva: boolean; onCambia: (v: boolean) => void; senzaEmail?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-12 items-center gap-3 rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio px-3">
        <input id={id} type="checkbox" className="size-5 accent-ink" checked={attiva && !senzaEmail} disabled={senzaEmail} onChange={(e) => onCambia(e.target.checked)} />
        <span className="flex-1 text-corpo">Manda l'invito</span>
        <span className="text-meta text-grigio">email con .ics</span>
      </label>
      {senzaEmail && <p className="text-meta text-grigio">Manca l'email del referente</p>}
    </div>
  );
}
