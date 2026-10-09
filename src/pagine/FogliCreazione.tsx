import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../api";
import { AreaTesto, Foglio, Pulsante } from "../ds";
import type { Creazione } from "../guscio/aree";
import type { LeadListItem } from "../types";
import { FoglioEsito } from "./commerciale/FoglioEsito";
import { FoglioNuovoLead } from "./commerciale/FoglioNuovoLead";
import { CercaLead, FoglioPropostaManuale } from "./commerciale/FoglioProposta";
import { FoglioNuovaAutomazione } from "./automazioni/FoglioAutomazione";
import { FoglioNuovoCliente } from "./commerciale/FoglioCliente";
import { FoglioNuovaFattura, FoglioNuovoCanone, FoglioNuovoCosto } from "./economia/Fogli";

function ScegliLead({ titolo, onScelto, onChiudi }: { titolo: string; onScelto: (l: LeadListItem) => void; onChiudi: () => void }) {
  return (
    <Foglio aperto titolo={titolo} onChiudi={onChiudi}>
      <CercaLead onScelto={onScelto} />
    </Foglio>
  );
}

function FoglioNota({ lead, onChiudi }: { lead: LeadListItem; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [testo, setTesto] = useState("");
  const salva = useMutation({
    mutationFn: () => api(`/leads/${lead.id}/activities`, { method: "POST", json: { type: "nota", body: testo } }),
    onSuccess: () => {
      toast.success("Nota salvata");
      void qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo={`Nota su ${lead.company}`} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={testo.trim() ? undefined : "Scrivi qualcosa"} onClick={() => salva.mutate()}>Salva nota</Pulsante>}>
      <AreaTesto etichetta="Nota" rows={5} autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} />
    </Foglio>
  );
}

// Un foglio per ogni creazione del "+": lo switch copre tutte le nove Creazione.
export function FogliCreazione({ crea, chiudi }: { crea: Creazione | null; chiudi: () => void }) {
  const [lead, setLead] = useState<LeadListItem | null>(null);
  const fine = () => { setLead(null); chiudi(); };
  switch (crea) {
    case "lead":
      return <FoglioNuovoLead onChiudi={fine} />;
    case "esito":
      return lead ? <FoglioEsito lead={lead} onChiudi={fine} /> : <ScegliLead titolo="Esito di quale lead" onScelto={setLead} onChiudi={fine} />;
    case "nota":
      return lead ? <FoglioNota lead={lead} onChiudi={fine} /> : <ScegliLead titolo="Nota su quale lead" onScelto={setLead} onChiudi={fine} />;
    case "proposta":
      return <FoglioPropostaManuale onChiudi={fine} />;
    case "cliente":
      return <FoglioNuovoCliente onChiudi={fine} />;
    case "canone":
      return <FoglioNuovoCanone onChiudi={fine} />;
    case "fattura":
      return <FoglioNuovaFattura onChiudi={fine} />;
    case "costo":
      return <FoglioNuovoCosto onChiudi={fine} />;
    case "automazione":
      return <FoglioNuovaAutomazione onChiudi={fine} />;
  }
  return null;
}
