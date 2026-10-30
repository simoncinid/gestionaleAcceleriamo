import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { CoachApi, Precompilato } from "../../../worker/calls/coach-routes";
import { api } from "../../api";
import { Foglio, Pulsante, Riga, Skeleton } from "../../ds";
import { quando } from "../../format";
import { useStages } from "../../hooks";
import { FoglioEsito } from "./FoglioEsito";
import type { LeadEsito } from "./esito";

const STATO: Record<CoachApi["stato"], string> = {
  nessuno: "",
  in_coda: "Il coach legge le note: qualche minuto",
  in_corso: "Il coach sta scrivendo",
  pronto: "Suggerimenti del coach pronti",
  errore: "Il coach non è riuscito a rispondere",
  fermo_tetto: "Coach fermo: raggiunto il tetto di spesa del mese",
};

// Opzioni delle due azioni, fuori dal componente per provarle: un errore (404, 409, rete) arriva sempre in un toast.
export function azioniCoach(qc: QueryClient, callId: string, onPrecompilato: (p: Precompilato) => void) {
  return {
    chiedi: {
      mutationFn: () => api<CoachApi>(`/calls/${callId}/coach`, { method: "POST" }),
      onSuccess: (d: CoachApi) => qc.setQueryData(["coach", callId], d),
      onError: (e: Error) => toast.error(e.message),
    },
    applica: {
      mutationFn: (id: string) => api<{ precompilato: Precompilato }>(`/call-analyses/${id}/applica`, { method: "POST" }),
      onSuccess: (d: { precompilato: Precompilato }) => onPrecompilato(d.precompilato),
      onError: (e: Error) => toast.error(e.message),
    },
  };
}

// Spec 6.7: "Chiedi al coach" è secondario (il primario della scheda lead resta "Chiama"); i suggerimenti si aprono
// in un foglio che ha come unico primario "Applica i suggerimenti". Il testo di Claude resta testo, mai HTML.
export function CoachCall({ callId, lead }: { callId: string; leadId: string; lead: LeadEsito }) {
  const qc = useQueryClient();
  const fasi = useStages();
  const [aperto, setAperto] = useState(false);
  const [precompilato, setPrecompilato] = useState<Precompilato | null>(null);
  const q = useQuery({
    queryKey: ["coach", callId],
    queryFn: () => api<CoachApi>(`/calls/${callId}/coach`),
    refetchInterval: (d) => (d.state.data?.stato === "in_coda" || d.state.data?.stato === "in_corso" ? 30_000 : false),
  });
  const azioni = azioniCoach(qc, callId, (p) => { setAperto(false); setPrecompilato(p); });
  const chiedi = useMutation(azioni.chiedi);
  const applica = useMutation(azioni.applica);
  if (q.isPending) return <Skeleton righe={1} />;
  if (q.isError) return <p className="text-nota text-grigio">Il coach non si è caricato.</p>;
  const s = q.data;
  const r = s.risultato;
  const etichettaFase = (id: string | null) => (id ? fasi.data?.find((f) => f.id === id)?.label ?? id : "Nessuna fase suggerita");
  return (
    <div className="flex flex-col gap-2 pt-2">
      {s.stato !== "nessuno" && <p className="text-nota text-grigio">{STATO[s.stato]}</p>}
      {s.stato === "errore" && s.errore && <p className="text-nota text-grigio">{s.errore}</p>}
      {(s.stato === "nessuno" || s.stato === "errore") && (
        <div>
          <Pulsante variante="secondario" inCorso={chiedi.isPending} onClick={() => chiedi.mutate()}>
            {s.stato === "errore" ? "Chiedi di nuovo al coach" : "Chiedi al coach"}
          </Pulsante>
        </div>
      )}
      {s.stato === "pronto" && r && <Riga titolo="Leggi i suggerimenti del coach" peso="normale" onClick={() => setAperto(true)} />}
      {aperto && r && (
        <Foglio
          aperto
          titolo="Suggerimenti del coach"
          onChiudi={() => setAperto(false)}
          principale={
            <Pulsante variante="primario" misura="lg" className="w-full" inCorso={applica.isPending} onClick={() => s.id && applica.mutate(s.id)}>
              Applica i suggerimenti
            </Pulsante>
          }
        >
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-1">
              <h3 className="font-display text-voce">Riassunto</h3>
              <p className="text-testo whitespace-pre-line">{r.riassunto}</p>
            </section>
            <section className="flex flex-col gap-1">
              <h3 className="font-display text-voce">Fase suggerita</h3>
              <p className="text-testo">{etichettaFase(r.faseSuggerita)}</p>
            </section>
            <section className="flex flex-col gap-1">
              <h3 className="font-display text-voce">Prossima azione</h3>
              <p className="text-testo">{r.prossimaAzione.testo}</p>
              <p className="text-nota text-grigio">{quando(r.prossimaAzioneAt)}</p>
            </section>
            {r.bozzaFollowUp && (
              <section className="flex flex-col gap-1">
                <h3 className="font-display text-voce">Bozza di follow-up</h3>
                <p className="text-testo whitespace-pre-line">{r.bozzaFollowUp}</p>
              </section>
            )}
            {r.risposteObiezioni.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="font-display text-voce">Risposte alle obiezioni</h3>
                <ul className="flex flex-col gap-3">
                  {r.risposteObiezioni.map((o, i) => (
                    <li key={i}>
                      <p className="text-testo font-medium">{o.obiezione}</p>
                      <p className="text-testo">{o.risposta}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.controlli.length > 0 && (
              <section className="flex flex-col gap-1">
                <h3 className="font-display text-voce">Da sistemare</h3>
                <ul className="flex flex-col gap-1">{r.controlli.map((x, i) => <li key={i} className="text-testo">{x}</li>)}</ul>
              </section>
            )}
            <p className="text-nota text-grigio">Applica apre "Com'è andata?" già compilato: il lead cambia solo con Salva esito.</p>
          </div>
        </Foglio>
      )}
      {precompilato && <FoglioEsito lead={lead} iniziale={precompilato} onChiudi={() => setPrecompilato(null)} />}
    </div>
  );
}
