import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Riga } from "../../ds";
import type { PropostaRiga } from "../../types";
import { STATI, prezzo } from "./Proposte";

// Le proposte del lead nella scheda: numero, prezzo su una riga, stato e dove sta il PDF.
export function SezioneProposta({ leadId }: { leadId: string }) {
  const q = useQuery({ queryKey: ["lead", leadId, "proposte"], queryFn: () => api<{ proposte: PropostaRiga[] }>(`/leads/${leadId}/proposals`).then((r) => r.proposte) });
  if (!q.data?.length) return null;
  return (
    <section aria-label="Proposta" className="flex flex-col gap-2">
      <h2 className="font-display text-titolo-card">{q.data.length > 1 ? "Proposte" : "Proposta"}</h2>
      <ul className="flex flex-col gap-2">
        {q.data.map((p) => (
          <li key={p.id}>
            <Riga href={`/commerciale/proposte/${p.id}`} titolo={`${p.number}, ${STATI[p.status].toLowerCase()}`} secondaria={prezzo(p)} meta={p.pdfUrl ? "PDF collegato" : "PDF nel wiki"} />
          </li>
        ))}
      </ul>
    </section>
  );
}
