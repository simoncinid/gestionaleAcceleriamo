import { useId } from "react";
import { useStatoSistema } from "../impostazioni/parti";

export const TESTO_IN_CODA = "Invito in coda: partirà quando Resend sarà collegato";

// Resend collegato secondo lo stato delle integrazioni del server (mai da variabili lato client).
// Finché lo stato non arriva vale "non collegato": meglio non promettere un invio.
export function useResendCollegato(): boolean {
  return useStatoSistema().data?.segreti.resend === true;
}

// Casella "Manda l'invito": una riga da 48 px, spenta (con il motivo) se manca l'email del referente.
// Senza Resend resta spuntabile: l'invito va in coda e la riga sotto lo dice.
export function CasellaInvito({ attiva, onCambia, senzaEmail = false, inCoda = false }: { attiva: boolean; onCambia: (v: boolean) => void; senzaEmail?: boolean; inCoda?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-12 items-center gap-3 rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio px-3">
        <input id={id} type="checkbox" className="size-5 accent-ink" checked={attiva && !senzaEmail} disabled={senzaEmail} onChange={(e) => onCambia(e.target.checked)} />
        <span className="flex-1 text-corpo">Manda l'invito</span>
        <span className="text-meta text-grigio">email con .ics</span>
      </label>
      {senzaEmail && <p className="text-meta text-grigio">Manca l'email del referente</p>}
      {!senzaEmail && attiva && inCoda && <p className="text-meta text-grigio">{TESTO_IN_CODA}</p>}
    </div>
  );
}
