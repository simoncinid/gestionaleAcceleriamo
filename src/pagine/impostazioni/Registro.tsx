import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Skeleton, StatoVuoto } from "../../ds";
import { momento } from "../../format";
import type { VoceAudit } from "../../types";

const ENTITA: Record<string, string> = {
  lead: "Lead", stage: "Fase", stage_rules: "Regole", settings: "Impostazione", template: "Modello", client: "Cliente", clients: "Cliente",
  fees: "Canone", invoices: "Fattura", costs: "Costo", automations: "Automazione", campaign_spend: "Spesa della campagna", user: "Profilo",
  export: "Esportazione", import: "Importazione", document: "Documento",
};

// Spec 11.6: chi ha fatto cosa, dal più recente, 50 voci per volta. Sola lettura.
export function Registro() {
  const q = useInfiniteQuery({
    queryKey: ["audit"],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => api<{ voci: VoceAudit[]; prossimo: number | null }>(`/audit${pageParam ? `?prima=${pageParam}` : ""}`),
    getNextPageParam: (p) => p.prossimo,
  });
  const voci = q.data?.pages.flatMap((p) => p.voci) ?? [];
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4 pb-28">
      <Intestazione eyebrow="Dati" titolo="Registro delle modifiche" />
      {q.isLoading ? <Skeleton righe={8} /> : q.error ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : voci.length === 0 ? (
        <StatoVuoto titolo="Nessuna modifica registrata" testo="Qui compaiono le modifiche a lead, impostazioni ed economia, con chi le ha fatte." />
      ) : (
        <ul className="grid divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">
          {voci.map((v) => (
            <li key={v.id} className="grid gap-0.5 px-4 py-3">
              <span className="text-secondaria text-ink">{`${ENTITA[v.entita] ?? v.entita}: ${v.azione}`}</span>
              <span className="text-meta text-grigio">{v.chi}</span>
              <span className="text-meta text-grigio tabular-nums">{momento(v.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && <div><Pulsante variante="fantasma" inCorso={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Mostra le voci prima</Pulsante></div>}
    </div>
  );
}
