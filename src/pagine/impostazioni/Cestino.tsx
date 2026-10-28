import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Skeleton, StatoVuoto } from "../../ds";
import { trascorso } from "../../format";

// Blocco 1, modifica 9: ogni lead si ripristina (stessa fase, stesso storico) o si elimina per sempre, con la conferma
// nella riga stessa. Dopo 30 giorni nel cestino lo toglie il giro programmato.
type NelCestino = { id: string; company: string; deletedAt: number | null; giorniRimasti: number };

const restano = (g: number) => (g === 0 ? "si elimina da solo oggi" : g === 1 ? "si elimina da solo domani" : `si elimina da solo tra ${g} giorni`);

export function Cestino() {
  const qc = useQueryClient();
  const [conferma, setConferma] = useState<string | null>(null);
  const c = useQuery({ queryKey: ["trash"], queryFn: () => api<{ leads: NelCestino[] }>("/leads/trash").then((r) => r.leads) });
  const aggiorna = () => { for (const k of [["trash"], ["leads"], ["today"], ["badge"], ["dati", "riepilogo"]]) void qc.invalidateQueries({ queryKey: k }); };
  const ripristina = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/restore`, { method: "POST" }),
    onSuccess: () => { toast.success("Ripristinato nella sua fase"); aggiorna(); },
    onError: (e) => toast.error(e.message),
  });
  const elimina = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/per-sempre`, { method: "DELETE" }),
    onSuccess: () => { setConferma(null); toast.success("Eliminato per sempre"); aggiorna(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-4 p-4 md:px-0 md:pt-0 md:pb-8">
      <Intestazione titolo="Cestino" numero={c.data?.length || undefined} coda="lead" />
      {c.isLoading ? <Skeleton righe={4} /> : c.error ? <Errore errore={c.error} onRiprova={() => void c.refetch()} /> : c.data?.length === 0 ? (
        <StatoVuoto titolo="Il cestino è vuoto" testo="I lead messi nel cestino dalla scheda restano qui 30 giorni: si possono ripristinare o eliminare per sempre." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 @5xl:grid-cols-2 @7xl:grid-cols-3">
          {c.data?.map((l) => (
            <li key={l.id}>
              <div className="flex flex-col gap-3 rounded-blocco border border-sabbia bg-avorio px-4 py-3 @xl:flex-row @xl:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-corpo font-semibold">{l.company}</p>
                  {l.deletedAt && <p className="text-secondaria text-grigio">Messo nel cestino {trascorso(l.deletedAt)}</p>}
                  <p className="text-meta text-grigio tabular-nums">{restano(l.giorniRimasti)}</p>
                </div>
                {conferma === l.id ? (
                  <div role="group" aria-label={`Elimina per sempre ${l.company}`} className="flex flex-col gap-2 border-t border-sabbia pt-3 @xl:border-t-0 @xl:pt-0">
                    <p className="text-secondaria text-errore">Va via anche lo storico. Non si torna indietro.</p>
                    <div className="flex flex-wrap gap-2">
                      <Pulsante variante="distruttivo" inCorso={elimina.isPending} onClick={() => elimina.mutate(l.id)}>Elimina per sempre</Pulsante>
                      <Pulsante variante="fantasma" disabled={elimina.isPending} onClick={() => setConferma(null)}>Annulla</Pulsante>
                    </div>
                  </div>
                ) : (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Pulsante variante="secondario" inCorso={ripristina.isPending && ripristina.variables === l.id} onClick={() => ripristina.mutate(l.id)}>Ripristina</Pulsante>
                    <Pulsante variante="fantasma" onClick={() => setConferma(l.id)}>Elimina</Pulsante>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
