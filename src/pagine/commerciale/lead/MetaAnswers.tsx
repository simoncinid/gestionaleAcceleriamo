import type { Lead } from "../../../types";

export function contaRisposte(lead: Pick<Lead, "metaAnswers">): number {
  if (!lead.metaAnswers) return 0;
  try {
    return Object.keys(JSON.parse(lead.metaAnswers) as Record<string, string>).length;
  } catch {
    return 0;
  }
}

// Risposte del modulo Meta: domanda sopra, risposta sotto, una per riga.
export function MetaAnswers({ lead }: { lead: Lead }) {
  let answers: Record<string, string> = {};
  try {
    answers = lead.metaAnswers ? (JSON.parse(lead.metaAnswers) as Record<string, string>) : {};
  } catch {
    answers = {};
  }
  const voci = Object.entries(answers);
  if (voci.length === 0) return <p className="text-secondaria text-grigio">Nessuna risposta dal modulo.</p>;
  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col divide-y divide-sabbia">
        {voci.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 py-3">
            <dt className="text-secondaria text-grigio">{k.replace(/_/g, " ")}</dt>
            <dd className="text-corpo">{v}</dd>
          </div>
        ))}
      </dl>
      {(lead.metaAdset || lead.metaAd) && <p className="text-meta text-grigio">Inserzione: {[lead.metaAdset, lead.metaAd].filter(Boolean).join(", ")}</p>}
    </div>
  );
}
