import { Clock } from "@phosphor-icons/react";
import { useState } from "react";
import { CampoQuando, Pulsante, Selettore, cx } from "../../../ds";
import { quando } from "../../../format";
import type { Lead, Stage } from "../../../types";
import { opzioniAzione, testoTentativo } from "../esito";
import { poiSeRiesce, type Salva } from "./salvataggi";

// Blocco "Prossima azione" della scheda: cosa, quando, tentativo e cosa succede se non risponde.
// "Cambia" apre in posto la scelta dell'azione e del momento; si salva con un pulsante secondario (il primario è Chiama).
// L'editor si chiude solo se il server accetta: se rifiuta, le scelte restano lì.
export function NextActionCard({ lead, kind, ora, seNonRisponde, onSave, pending }: {
  lead: Lead; kind?: Stage["kind"]; ora: number; seNonRisponde?: string; onSave: Salva; pending: boolean;
}) {
  const [cambia, setCambia] = useState(false);
  const [azione, setAzione] = useState(lead.nextAction ?? "");
  const [momento, setMomento] = useState<number | null>(lead.nextActionAt);
  if (kind && kind !== "open") {
    return (
      <section aria-label="Prossima azione" className="rounded-blocco border border-sabbia bg-avorio p-4">
        <p className="text-etichetta uppercase text-grigio">Prossima azione</p>
        <p className="pt-2 text-corpo">{kind === "won" ? "Lead chiuso" : "Lead perso"}: nessuna azione da fare.</p>
      </section>
    );
  }
  const scaduta = lead.nextActionAt != null && lead.nextActionAt < ora;
  const apri = () => { setAzione(lead.nextAction ?? ""); setMomento(lead.nextActionAt); setCambia(true); };
  return (
    <section aria-label="Prossima azione" className={cx("rounded-blocco border border-sabbia p-4", scaduta ? "bg-tinta-2" : "bg-avorio")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-etichetta uppercase text-grigio">Prossima azione</p>
        {!cambia && <Pulsante variante="fantasma" className="-my-2 -mr-3" onClick={apri}>Cambia</Pulsante>}
      </div>
      {cambia ? (
        <div className="flex flex-col gap-3 pt-3">
          <Selettore etichetta="Azione" valore={azione || null} opzioni={opzioniAzione(azione)} onCambia={setAzione} />
          <CampoQuando etichetta="Quando" valore={momento} onCambia={setMomento} />
          <div className="flex gap-2">
            <Pulsante variante="secondario" inCorso={pending} motivoSpento={!azione.trim() || momento == null ? "Scegli l'azione e quando" : undefined}
              onClick={() => poiSeRiesce(onSave, () => setCambia(false))({ nextAction: azione.trim(), nextActionAt: momento })}>Salva</Pulsante>
            <Pulsante variante="fantasma" onClick={() => setCambia(false)}>Annulla</Pulsante>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 pt-2">
          <p className="flex items-center gap-2 text-corpo">
            <Clock size={18} weight="bold" aria-hidden className={cx("shrink-0", scaduta ? "text-errore" : "text-grigio")} />
            <span className="min-w-0 truncate">{lead.nextAction ?? "Nessuna azione"}</span>
          </p>
          {lead.nextActionAt != null && <p className={cx("text-secondaria tabular-nums", scaduta ? "font-semibold text-errore" : "text-grigio")}>{quando(lead.nextActionAt, ora)}</p>}
          <p className="text-secondaria text-grigio tabular-nums">{testoTentativo(lead.attemptCount)}</p>
          {seNonRisponde && <p className="text-secondaria text-grigio">Se non risponde: {seNonRisponde}</p>}
        </div>
      )}
    </section>
  );
}
