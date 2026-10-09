import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { CampoQuando, Foglio, Pulsante } from "../../ds";

// Sposta solo la data della prossima azione: fase e azione restano quelle.
export function FoglioRimanda({ leadId, onChiudi }: { leadId: string; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [quando, setQuando] = useState<number | null>(null);
  const salva = useMutation({
    mutationFn: () => api(`/leads/${leadId}`, { method: "PATCH", json: { nextActionAt: quando } }),
    onSuccess: () => {
      toast.success("Rimandato");
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["badge"] });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Rimanda a" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={quando == null ? "Scegli quando" : undefined} onClick={() => salva.mutate()}>Rimanda</Pulsante>}>
      <CampoQuando etichetta="Quando" valore={quando} onCambia={setQuando} apertoAllInizio />
    </Foglio>
  );
}
