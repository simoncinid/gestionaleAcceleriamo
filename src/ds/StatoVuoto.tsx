import type { ReactNode } from "react";

export function StatoVuoto({ titolo, testo, azione }: { titolo: string; testo?: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-blocco bg-crema p-6">
      <p className="font-display text-titolo-card">{titolo}</p>
      {testo && <p className="text-secondaria text-grigio">{testo}</p>}
      {azione && <div className="mt-2">{azione}</div>}
    </div>
  );
}
