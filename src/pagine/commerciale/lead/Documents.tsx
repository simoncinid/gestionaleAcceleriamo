import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../api";
import { Campo, Pulsante } from "../../../ds";
import { momento } from "../../../format";
import { useRefreshLeads } from "../../../hooks";
import type { DocumentRow } from "../../../types";

// Documenti come link (Drive, Docs). Togliere chiede un secondo tocco sullo stesso pulsante.
export function Documents({ leadId, documents, ora }: { leadId: string; documents: DocumentRow[]; ora: number }) {
  const refresh = useRefreshLeads();
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [chiede, setChiede] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api(`/leads/${leadId}/documents`, { method: "POST", json: { name: nome.trim(), url: url.trim() } }),
    onSuccess: () => { setNome(""); setUrl(""); toast.success("Documento aggiunto"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => { setChiede(null); toast.success("Documento tolto"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-4">
      {documents.length === 0 ? <p className="text-secondaria text-grigio">Nessun documento.</p> : (
        <ul className="flex flex-col divide-y divide-sabbia">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {d.url
                  ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-corpo text-accento-testo underline-offset-4 hover:underline">{d.name}</a>
                  : <span className="truncate text-corpo">{d.name}</span>}
                <span className="text-secondaria text-grigio tabular-nums">{momento(d.createdAt, ora)}</span>
              </div>
              <Pulsante variante={chiede === d.id ? "distruttivo" : "fantasma"} className="shrink-0" inCorso={remove.isPending && remove.variables === d.id}
                onClick={() => (chiede === d.id ? remove.mutate(d.id) : setChiede(d.id))}>
                {chiede === d.id ? "Tocca di nuovo" : "Togli"}
              </Pulsante>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3">
        <Campo etichetta="Nome del documento" placeholder="Preventivo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo etichetta="Link" type="url" inputMode="url" placeholder="https://drive.google.com/..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <Pulsante variante="secondario" className="self-start" inCorso={add.isPending} motivoSpento={nome.trim() && url.trim() ? undefined : "Servono nome e link"} onClick={() => add.mutate()}>
          Aggiungi link
        </Pulsante>
      </div>
    </div>
  );
}
