import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SchedaApi } from "../../../worker/schede/routes";
import { api } from "../../api";
import { Pulsante, Skeleton, TestoMarkdown, classiPulsante } from "../../ds";
import { momento } from "../../format";

const RIGA_STATO: Record<SchedaApi["stato"], string> = {
  nessuna: "Nessuna ricerca",
  in_coda: "In coda: pronta entro qualche minuto",
  in_corso: "In preparazione",
  pronta: "Pronta",
  errore: "Non riuscita",
  privato: "Scheda non preparata: sembra un privato",
  fermo_tetto: "Ferma: raggiunto il tetto di spesa del mese",
};

// Con una versione pronta già visibile, la riga parla della versione nuova.
const RIGA_NUOVA: Partial<Record<SchedaApi["stato"], string>> = {
  in_coda: "Nuova versione in preparazione",
  in_corso: "Nuova versione in preparazione",
  errore: "Nuova versione non riuscita",
  fermo_tetto: "Nuova versione ferma: raggiunto il tetto di spesa del mese",
};

const http = (u: string) => /^https?:\/\//.test(u);

// Opzioni delle due azioni, fuori dal componente per provarle: un errore (404, 500, rete) arriva sempre in un toast.
export function azioniScheda(qc: QueryClient, leadId: string) {
  return {
    prepara: {
      mutationFn: (forza: boolean) => api<SchedaApi>(`/leads/${leadId}/scheda-azienda`, { method: "POST", json: { forza } }),
      onSuccess: (d: SchedaApi) => qc.setQueryData(["scheda-azienda", leadId], d),
      onError: (e: Error) => toast.error(e.message),
    },
    riprova: {
      mutationFn: (jobId: string) => api(`/ai-jobs/${jobId}/riprova`, { method: "POST" }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["scheda-azienda", leadId] }),
      onError: (e: Error) => toast.error(e.message),
    },
  };
}

// Spec 6.6, sezione 8; contratto blocco 1, sezioni 3 e 9: "Ricerca sull'azienda" nel riquadro Assistente.
// Nessun pulsante pieno qui: il primario della scheda lead sta in Da fare.
// Il testo di Claude passa da TestoMarkdown: resta testo, mai HTML interpretato.
// incorporata: dentro il riquadro Assistente della scheda il titolo lo dà la riga che si apre.
export function SezioneSchedaAzienda({ leadId, manuale, incorporata = false }: { leadId: string; manuale: boolean; incorporata?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scheda-azienda", leadId],
    queryFn: () => api<SchedaApi>(`/leads/${leadId}/scheda-azienda`),
    refetchInterval: (d) => (d.state.data?.stato === "in_coda" || d.state.data?.stato === "in_corso" ? 30_000 : false),
  });
  const azioni = azioniScheda(qc, leadId);
  const prepara = useMutation(azioni.prepara);
  const riprova = useMutation(azioni.riprova);
  if (q.isPending) return <Skeleton righe={2} />;
  if (q.isError) return <p className="text-nota text-grigio">La scheda azienda non si è caricata.</p>;
  const s = q.data;
  const fonti = s.fonti.filter((f) => http(f.url));
  return (
    <section aria-labelledby="titolo-scheda-azienda" className="flex flex-col gap-2">
      <h2 id="titolo-scheda-azienda" className={incorporata ? "sr-only" : "font-sans text-sezione font-semibold"}>Ricerca sull'azienda</h2>
      <p className="text-nota text-grigio">{(s.contenuto && RIGA_NUOVA[s.stato]) || RIGA_STATO[s.stato]}</p>
      {s.stato === "nessuna" && manuale && <p className="text-nota text-grigio">Per i lead scritti a mano si prepara su richiesta.</p>}
      {s.motivo && <p className="text-nota text-grigio">{s.motivo}</p>}
      {s.errore && <p className="text-nota text-grigio">{s.errore}</p>}
      {s.stato === "nessuna" && (
        <div><Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(false)}>Genera la ricerca</Pulsante></div>
      )}
      {s.stato === "privato" && (
        <div><Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(true)}>Prepara comunque</Pulsante></div>
      )}
      {s.stato === "errore" && (
        <div>
          {s.jobId ? (
            <Pulsante variante="secondario" inCorso={riprova.isPending} onClick={() => riprova.mutate(s.jobId!)}>Riprova la ricerca</Pulsante>
          ) : (
            <Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(false)}>Genera la ricerca</Pulsante>
          )}
        </div>
      )}
      {s.contenuto && (
        <>
          <p className="text-nota text-grigio">Versione {s.versione}</p>
          {s.aggiornata != null && <p className="text-nota text-grigio">Aggiornata {momento(s.aggiornata)}</p>}
          <TestoMarkdown testo={s.contenuto} />
          {fonti.length > 0 && (
            <>
              <h3 className="mt-4 font-display text-voce">Fonti</h3>
              <ul className="flex flex-col gap-1">
                {fonti.map((f) => <li key={f.url}><a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.titolo}</a></li>)}
              </ul>
            </>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {s.stato === "pronta" && (
              <Pulsante variante="secondario" inCorso={prepara.isPending} onClick={() => prepara.mutate(true)}>Rigenera la ricerca</Pulsante>
            )}
            <a className={classiPulsante("fantasma", "md")} href={`/api/leads/${leadId}/scheda-azienda/stampa`} target="_blank" rel="noopener">Apri la versione da stampare</a>
          </div>
        </>
      )}
    </section>
  );
}
