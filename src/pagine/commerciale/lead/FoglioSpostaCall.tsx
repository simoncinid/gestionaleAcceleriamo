import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { eCallNelPassato } from "../../../errori";
import { Campo, CampoQuando, Foglio, Pulsante } from "../../../ds";

// Sposta la call già fissata (nuovo giorno e ora) o le aggiunge il link: cambia la call, non ne crea un'altra.
export function FoglioSpostaCall({ leadId, call, soloLink, onChiudi }: {
  leadId: string; call: { id: string; scheduledAt: number; meetLink: string | null }; soloLink?: boolean; onChiudi: () => void;
}) {
  const qc = useQueryClient();
  const [quando, setQuando] = useState<number | null>(soloLink ? call.scheduledAt : null);
  const [meet, setMeet] = useState(call.meetLink ?? "");
  const [errore, setErrore] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api(`/calls/${call.id}`, { method: "PATCH", json: { scheduledAt: quando, meetLink: meet.trim() || null } }),
    onSuccess: () => {
      toast.success(soloLink ? "Link salvato" : "Call spostata");
      for (const k of [["lead", leadId], ["calls"], ["today"], ["leads"], ["badge"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => (eCallNelPassato(e) ? setErrore(e.message) : toast.error(e.message)),
  });
  const manca = soloLink ? (meet.trim() ? undefined : "Incolla il link della call") : quando == null ? "Scegli il nuovo giorno e ora" : undefined;
  return (
    <Foglio aperto lato titolo={soloLink ? "Aggiungi il link della call" : "Sposta la call"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>{soloLink ? "Salva il link" : "Sposta la call"}</Pulsante>}>
      <div className="flex flex-col gap-3">
        {!soloLink && <CampoQuando etichetta="Nuovo giorno e ora" valore={quando} onCambia={(ms) => { setQuando(ms); setErrore(null); }} errore={errore} apertoAllInizio />}
        <Campo etichetta="Link della call" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={meet} onChange={(e) => setMeet(e.target.value)} />
        <a className="inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-4" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
      </div>
    </Foglio>
  );
}
