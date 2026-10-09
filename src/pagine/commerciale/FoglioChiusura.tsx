import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import type { Stage } from "../../types";
import { centesimi } from "./scheda";

// Foglio che si apre quando la fase cambia verso una persa (serve il motivo) o verso Chiuso (servono setup, canone e inizio).
// PV2: i dati sono obbligatori solo se la fase cambia davvero; sulla fase attuale il foglio non chiede nulla.
export function FoglioChiusura({ lead, fase, onChiudi }: { lead: { id: string; stageId: string }; fase: Stage; onChiudi: () => void }) {
  const qc = useQueryClient();
  const vinto = fase.kind === "won";
  const cambia = fase.id !== lead.stageId;
  const motivi = useQuery({ queryKey: ["settings"], queryFn: () => api<{ motivi: { id: string; etichetta: string }[] }>("/settings"), enabled: !vinto });
  const [motivo, setMotivo] = useState<string | null>(null);
  const [setup, setSetup] = useState("");
  const [canone, setCanone] = useState("");
  const [inizio, setInizio] = useState<number | null>(null);
  const setupCents = centesimi(setup);
  const feeCents = centesimi(canone);
  const corpo = vinto ? { stageId: fase.id, setupCents, feeCents, wonStartAt: inizio } : { stageId: fase.id, lostReason: motivo };
  const manca = !cambia
    ? undefined
    : vinto
      ? setupCents == null ? "Scrivi il setup in euro" : feeCents == null ? "Scrivi il canone mensile in euro" : inizio == null ? "Scegli la data di inizio" : undefined
      : !motivo ? "Scegli il motivo" : undefined;
  const salva = useMutation({
    mutationFn: () => api(`/leads/${lead.id}`, { method: "PATCH", json: corpo }),
    onSuccess: () => {
      toast.success(vinto ? "Chiuso, ottimo" : `Spostato in ${fase.label}`);
      for (const k of [["lead", lead.id], ["leads"], ["today"], ["badge"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo={vinto ? "Chiuso: i dati del cliente" : `${fase.label}: perché`} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva</Pulsante>}>
      <div className="flex flex-col gap-3">
        {vinto ? (
          <>
            <Campo etichetta="Setup (euro)" inputMode="decimal" placeholder="1.800" value={setup} onChange={(e) => setSetup(e.target.value)} />
            <Campo etichetta="Canone mensile (euro)" inputMode="decimal" placeholder="150" value={canone} onChange={(e) => setCanone(e.target.value)} />
            <CampoQuando etichetta="Data di inizio" valore={inizio} onCambia={setInizio} />
          </>
        ) : (
          <Selettore etichetta="Motivo" apertoAllInizio opzioni={(motivi.data?.motivi ?? []).map((m) => ({ valore: m.id, etichetta: m.etichetta }))} valore={motivo} onCambia={setMotivo} />
        )}
      </div>
    </Foglio>
  );
}
