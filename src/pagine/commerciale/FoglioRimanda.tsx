import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { CampoQuando, Foglio, Pulsante, cx } from "../../ds";
import { AZIONE_SI_FARA_VIVO } from "../../../worker/processo/processo";

const SETTE_GIORNI = 7 * 86_400_000;

// Sposta solo la data della prossima azione: fase e azione restano quelle.
// Blocco 1 bis: "Si farà vivo lui" (il caso più frequente di Diego): richiamo fra 7 giorni, il Da fare diventa
// "Se non si è fatto vivo, richiama <nome>" e nello storico resta "Aspettiamo che richiami lui".
export function FoglioRimanda({ leadId, onChiudi }: { leadId: string; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [quando, setQuando] = useState<number | null>(null);
  const [aspetta, setAspetta] = useState(false);
  const salva = useMutation({
    mutationFn: async () => {
      if (!aspetta) return api(`/leads/${leadId}`, { method: "PATCH", json: { nextActionAt: quando } });
      await api(`/leads/${leadId}`, { method: "PATCH", json: { nextAction: AZIONE_SI_FARA_VIVO, nextActionAt: Date.now() + SETTE_GIORNI } });
      return api(`/leads/${leadId}/activities`, { method: "POST", json: { type: "nota", body: AZIONE_SI_FARA_VIVO } });
    },
    onSuccess: () => {
      toast.success(aspetta ? "Aspettiamo che si faccia vivo: richiamo fra 7 giorni" : "Rimandato");
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["badge"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Rimanda a" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={!aspetta && quando == null ? "Scegli quando" : undefined} onClick={() => salva.mutate()}>Rimanda</Pulsante>}>
      <button type="button" role="checkbox" aria-checked={aspetta} onClick={() => setAspetta((a) => !a)}
        className={cx("flex min-h-14 w-full items-center gap-3 rounded-controllo border-[1.5px] bg-avorio px-4 py-2.5 text-left transition-colors duration-(--durata-veloce)", aspetta ? "border-ink" : "border-sabbia-2 hover:border-ink")}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">Si farà vivo lui</span>
          <span className="text-[13px] text-grigio">Se non si fa sentire, richiamo fra 7 giorni</span>
        </span>
        <span className="flex w-5 justify-end">{aspetta && <Check size={18} weight="bold" aria-hidden />}</span>
      </button>
      {!aspetta && <CampoQuando etichetta="Quando" valore={quando} onCambia={setQuando} apertoAllInizio />}
    </Foglio>
  );
}
