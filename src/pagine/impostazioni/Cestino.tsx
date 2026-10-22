import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Riga, Skeleton, StatoVuoto } from "../../ds";
import { trascorso } from "../../format";
import type { LeadListItem } from "../../types";

export function Cestino() {
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ["trash"], queryFn: () => api<{ leads: LeadListItem[] }>("/leads/trash").then((r) => r.leads) });
  const ripristina = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/restore`, { method: "POST" }),
    onSuccess: () => { toast.success("Ripristinato"); for (const k of [["trash"], ["leads"], ["today"], ["badge"]]) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-col gap-4 p-4 md:px-0 md:pt-0 md:pb-8">
      <Intestazione titolo="Cestino" numero={c.data?.length || undefined} coda="lead" />
      {c.isLoading ? <Skeleton righe={4} /> : c.error ? <Errore errore={c.error} onRiprova={() => void c.refetch()} /> : c.data?.length === 0 ? (
        <StatoVuoto titolo="Il cestino è vuoto" testo="I lead messi nel cestino dalla scheda compaiono qui e si possono ripristinare." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 @5xl:grid-cols-2 @7xl:grid-cols-3">
          {c.data?.map((l) => (
            <li key={l.id}>
              <Riga titolo={l.company} secondaria={l.deletedAt ? `Messo nel cestino ${trascorso(l.deletedAt)}` : undefined}
                destra={<Pulsante variante="fantasma" className="shrink-0" inCorso={ripristina.isPending && ripristina.variables === l.id} onClick={() => ripristina.mutate(l.id)}>Ripristina</Pulsante>} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
