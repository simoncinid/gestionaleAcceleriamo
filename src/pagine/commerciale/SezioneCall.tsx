import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api";
import { Riga } from "../../ds";
import { momento } from "../../format";
import type { CallAgenda } from "../../types";
import { CoachCall } from "./CoachCall";
import type { LeadEsito } from "./esito";
import { FoglioCall } from "./FoglioCall";
import { leggiNote } from "./note-call";

const STATO = { fatta: "Fatta", saltata: "Saltata", rimandata: "Rimandata" } as const;

// Call del lead nella scheda: una riga per call, il tocco apre il foglio con esito e note.
// Sotto ogni call fatta c'è il coach (spec 6.7), se la scheda passa il lead per il Foglio Esito.
export function SezioneCall({ leadId, ora, lead }: { leadId: string; ora?: number; lead?: LeadEsito }) {
  const q = useQuery({ queryKey: ["lead", leadId, "calls"], queryFn: () => api<{ calls: CallAgenda[] }>(`/leads/${leadId}/calls`).then((r) => r.calls) });
  const [aperta, setAperta] = useState<CallAgenda | null>(null);
  if (!q.data?.length) return null;
  return (
    <section aria-label="Call" className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="segno font-display text-sezione">Call</h2>
        <span className="text-nota text-grigio tabular-nums">{q.data.length}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {q.data.map((k) => {
          const n = leggiNote(k.notes);
          const sintesi = n.problema?.trim() || n.reazione?.trim();
          return (
            <li key={k.id}>
              <Riga titolo={`Call di ${k.kind}, ${momento(k.scheduledAt, ora)}${k.durationMin ? `, ${k.durationMin} min` : ""}`} secondaria={k.outcome ? STATO[k.outcome] : "In programma"} meta={sintesi || undefined} onClick={() => setAperta(k)} />
              {lead && k.outcome === "fatta" && <CoachCall callId={k.id} leadId={leadId} lead={lead} />}
            </li>
          );
        })}
      </ul>
      {aperta && <FoglioCall k={aperta} onChiudi={() => setAperta(null)} />}
    </section>
  );
}
