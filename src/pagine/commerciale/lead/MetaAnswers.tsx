import { Card } from "../../../components/ui";
import type { Lead } from "../../../types";

export function MetaAnswers({ lead }: { lead: Lead }) {
  if (!lead.metaAnswers) return null;
  let answers: Record<string, string>;
  try {
    answers = JSON.parse(lead.metaAnswers) as Record<string, string>;
  } catch {
    return null;
  }
  return (
    <Card title="risposte del modulo meta">
      <dl className="grid gap-2 text-sm">
        {Object.entries(answers).map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink/50">{k.replace(/_/g, " ")}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {(lead.metaAdset || lead.metaAd) && <p className="mt-3 text-xs text-ink/50">Inserzione: {[lead.metaAdset, lead.metaAd].filter(Boolean).join(" / ")}</p>}
    </Card>
  );
}
