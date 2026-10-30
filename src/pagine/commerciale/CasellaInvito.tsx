import { Interruttore } from "../../ds";
import { useStatoSistema } from "../impostazioni/parti";

export const TESTO_IN_CODA = "Invito in coda: partirà quando Resend sarà collegato";

// Resend collegato secondo lo stato delle integrazioni del server (mai da variabili lato client).
// Finché lo stato non arriva vale "non collegato": meglio non promettere un invio.
export function useResendCollegato(): boolean {
  return useStatoSistema().data?.segreti.resend === true;
}

// "Manda l'invito": un interruttore; se manca l'email del referente una riga ferma col motivo.
// Senza Resend resta spuntabile: l'invito va in coda e la riga sotto lo dice.
export function CasellaInvito({ attiva, onCambia, senzaEmail = false, inCoda = false }: { attiva: boolean; onCambia: (v: boolean) => void; senzaEmail?: boolean; inCoda?: boolean }) {
  // Interruttore del DS al posto della casella nativa (Task 14b); senza email la riga è un testo, non un controllo spento.
  if (senzaEmail) {
    return (
      <div className="flex min-h-14 flex-col justify-center rounded-blocco border border-sabbia bg-avorio px-4 py-2">
        <span className="text-testo font-semibold">Niente invito</span>
        <span className="text-nota text-grigio">Manca l'email del referente</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Interruttore etichetta="Manda l'invito" aiuto="Email con il file del calendario (.ics)" acceso={attiva} onCambia={onCambia} />
      {attiva && inCoda && <p className="text-nota text-grigio">{TESTO_IN_CODA}</p>}
    </div>
  );
}
