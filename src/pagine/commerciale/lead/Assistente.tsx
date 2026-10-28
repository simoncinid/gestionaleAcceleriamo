import { CaretDown } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api";
import type { CallAgenda } from "../../../types";
import { CoachCall } from "../CoachCall";
import type { LeadEsito } from "../esito";
import { SezioneSchedaAzienda } from "../SezioneSchedaAzienda";
import { Sezione } from "./Sezione";
import { SECONDARIO } from "./stile";

// Riquadro Assistente (contratto blocco 1, sezione 9): solo quello che c'è già. La ricerca sull'azienda resta chiusa
// (è l'unica parte che si apre e si chiude nella scheda), il coach compare dopo una call fatta.
export function Assistente({ lead, manuale }: { lead: LeadEsito; manuale: boolean }) {
  const call = useQuery({ queryKey: ["lead", lead.id, "calls"], queryFn: () => api<{ calls: CallAgenda[] }>(`/leads/${lead.id}/calls`).then((r) => r.calls) });
  const fatta = [...(call.data ?? [])].filter((k) => k.outcome === "fatta").sort((a, b) => b.scheduledAt - a.scheduledAt)[0];
  return (
    <Sezione titolo="Assistente" nome="assistente">
      <details className="group border-t border-[#E5DED4]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 pt-3 [&::-webkit-details-marker]:hidden">
          <span className="flex-1 text-[15px] font-semibold">Ricerca sull'azienda</span>
          <CaretDown size={18} weight="bold" aria-hidden className="shrink-0 motion-safe:transition-transform group-open:rotate-180" />
        </summary>
        <div className="pt-2"><SezioneSchedaAzienda leadId={lead.id} manuale={manuale} incorporata /></div>
      </details>
      {fatta && (
        <div className="flex flex-col gap-1 border-t border-[#E5DED4] pt-3">
          <p className="text-[15px] font-semibold">Coach della call</p>
          <CoachCall callId={fatta.id} leadId={lead.id} lead={lead} />
        </div>
      )}
      <p className={`${SECONDARIO} border-t border-[#E5DED4] pt-3`}>Le altre funzioni arrivano con il blocco 7.</p>
    </Sezione>
  );
}
