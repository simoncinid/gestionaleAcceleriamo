import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SchedaApi } from "../../../worker/schede/routes";
import { api } from "../../api";
import { Pulsante, Skeleton, TestoMarkdown, classiPulsante } from "../../ds";
import { momento } from "../../format";

const RIGA_STATO: Record<SchedaApi["stato"], string> = {
  nessuna: "Nessuna scheda",
  in_coda: "In coda: Claude la prepara entro qualche minuto",
  in_corso: "Claude la sta preparando",
  pronta: "Pronta",
  errore: "Non riuscita",
  privato: "Scheda non preparata: sembra un privato",
  fermo_tetto: "Ferma: Claude ha raggiunto il tetto del mese",
};

const http = (u: string) => /^https?:\/\//.test(u);

// Spec 6.6, sezione 8. Nessun pulsante pieno qui: il primario della scheda lead resta "Chiama".
// Il testo di Claude passa da TestoMarkdown: resta testo, mai HTML interpretato.
export function SezioneSchedaAzienda({ leadId, manuale }: { leadId: string; manuale: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scheda-azienda", leadId],
    queryFn: () => api<SchedaApi>(`/leads/${leadId}/scheda-azienda`),
    refetchInterval: (d) => (d.state.data?.stato === "in_coda" || d.state.data?.stato === "in_corso" ? 30_000 : false),
  });
  const prepara = useMutation({
    mutationFn: (forza: boolean) => api<SchedaApi>(`/leads/${leadId}/scheda-azienda`, { method: "POST", json: { forza } }),
    onSuccess: (d) => qc.setQueryData(["scheda-azienda", leadId], d),
  });
  const riprova = useMutation({
    mutationFn: (jobId: string) => api(`/ai-jobs/${jobId}/riprova`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheda-azienda", leadId] }),
  });
  if (q.isPending) return <Skeleton righe={2} />;
  if (q.isError) return <p className="text-secondaria text-grigio">La scheda azienda non si è caricata.</p>;
  const s = q.data;
  const fonti = s.fonti.filter((f) => http(f.url));
  return (
    <section aria-labelledby="titolo-scheda-azienda" className="flex flex-col gap-2">
      <h2 id="titolo-scheda-azienda" className="font-display text-titolo-card">Scheda azienda di Claude</h2>
      <p className="text-secondaria text-grigio">{RIGA_STATO[s.stato]}</p>
      {s.stato === "nessuna" && manuale && <p className="text-secondaria text-grigio">Per i lead scritti a mano si prepara su richiesta.</p>}
      {s.motivo && <p className="text-secondaria text-grigio">{s.motivo}</p>}
      {s.errore && <p className="text-secondaria text-grigio">{s.errore}</p>}
      {s.stato === "nessuna" && (
        <div><Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(false)}>Prepara la scheda</Pulsante></div>
      )}
      {s.stato === "privato" && (
        <div><Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(true)}>Prepara comunque</Pulsante></div>
      )}
      {s.stato === "errore" && (
        <div>
          {s.jobId ? (
            <Pulsante variante="secondario" inCorso={riprova.isPending} onClick={() => riprova.mutate(s.jobId!)}>Riprova la scheda</Pulsante>
          ) : (
            <Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(false)}>Prepara la scheda</Pulsante>
          )}
        </div>
      )}
      {s.stato === "pronta" && s.contenuto && (
        <>
          <p className="text-secondaria text-grigio">Versione {s.versione}</p>
          {s.aggiornata != null && <p className="text-secondaria text-grigio">Aggiornata {momento(s.aggiornata)}</p>}
          <TestoMarkdown testo={s.contenuto} />
          {fonti.length > 0 && (
            <>
              <h3 className="mt-4 font-display text-riga">Fonti</h3>
              <ul className="flex flex-col gap-1">
                {fonti.map((f) => <li key={f.url}><a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.titolo}</a></li>)}
              </ul>
            </>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(true)}>Rigenera la scheda</Pulsante>
            <a className={classiPulsante("fantasma", "md")} href={`/api/leads/${leadId}/scheda-azienda/stampa`} target="_blank" rel="noopener">Apri la versione da stampare</a>
          </div>
        </>
      )}
    </section>
  );
}
