import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { AreaTesto, Pulsante, Selettore } from "../../../ds";
import { momento } from "../../../format";
import { useRefreshLeads } from "../../../hooks";
import type { Activity } from "../../../types";

const TIPI = [{ valore: "nota", etichetta: "Nota" }, { valore: "chiamata", etichetta: "Chiamata" }, { valore: "email", etichetta: "Email" }] as const;
type Tipo = (typeof TIPI)[number]["valore"];

// Storico: una voce per riga (cosa è successo), sotto chi e quando. In cima si aggiunge una nota a mano.
export function Timeline({ leadId, activities, ora }: { leadId: string; activities: Activity[]; ora: number }) {
  const refresh = useRefreshLeads();
  const [tipo, setTipo] = useState<Tipo>("nota");
  const [testo, setTesto] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/leads/${leadId}/activities`, { method: "POST", json: { type: tipo, body: testo.trim() } }),
    onSuccess: () => { setTesto(""); toast.success("Aggiunto allo storico"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Tipo" valore={tipo} opzioni={[...TIPI]} onCambia={setTipo} />
        <AreaTesto etichetta="Cosa è successo" rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} />
        <Pulsante variante="secondario" className="self-start" inCorso={add.isPending} motivoSpento={testo.trim() ? undefined : "Scrivi cosa è successo"} onClick={() => add.mutate()}>
          Aggiungi
        </Pulsante>
      </div>
      {activities.length === 0 ? <p className="text-secondaria text-grigio">Ancora nessuna voce.</p> : (
        <ol className="flex flex-col divide-y divide-sabbia">
          {activities.map((a) => (
            <li key={a.id} className="flex min-w-0 flex-col gap-0.5 py-3">
              <p className="whitespace-pre-wrap break-words text-corpo">{a.body}</p>
              <p className="text-secondaria text-grigio tabular-nums">{a.authorName} · {momento(a.createdAt, ora)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
