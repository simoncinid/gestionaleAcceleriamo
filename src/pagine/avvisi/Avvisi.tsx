import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../../api";
import { Errore, Intestazione, Punto, Riga, Skeleton, StatoVuoto } from "../../ds";
import { trascorso } from "../../format";

type AvvisoApi = { id: string; evento: string; titolo: string; testo: string | null; href: string | null; createdAt: number; letto: boolean };

// Spec 8: la voce "Avvisi" dell'avatar. Nessun pulsante pieno: si tocca la riga e si va dove serve.
// All'apertura gli avvisi diventano letti (il punto sull'avatar sparisce), ma restano finché la cosa non è fatta.
export function Avvisi() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ avvisi: AvvisoApi[]; nonLetti: number }>("/notifications") });
  const letti = useMutation({
    mutationFn: () => api("/notifications/letti", { method: "POST", json: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badge"] }),
  });
  useEffect(() => {
    if (q.data?.nonLetti) letti.mutate();
  }, [q.data?.nonLetti]);
  if (q.isPending) return <div className="p-4 md:px-0 md:pt-0"><Skeleton righe={4} /></div>;
  if (q.isError) return <div className="p-4 md:px-0 md:pt-0"><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const { avvisi } = q.data;
  return (
    <div className="p-4 pb-28 md:px-0 md:pt-0">
      <Intestazione eyebrow="Impostazioni" titolo="Avvisi" numero={avvisi.length || undefined} />
      {avvisi.length === 0 ? (
        <StatoVuoto titolo="Nessun avviso aperto" testo="Gli avvisi si chiudono da soli quando la cosa è fatta." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 @5xl:grid-cols-2">
          {avvisi.map((a) => (
            <li key={a.id}>
              {/* Non letti: titolo in peso medio e pallino in accento; letti in peso normale. */}
              <Riga titolo={a.titolo} secondaria={a.testo ?? undefined} meta={trascorso(a.createdAt)} href={a.href ?? undefined}
                peso={a.letto ? "normale" : "medio"} destra={a.letto ? undefined : <Punto colore="accento" etichetta="Da leggere" />} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
