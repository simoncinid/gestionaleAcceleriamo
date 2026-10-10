import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Errore, Intestazione, Pulsante, Riga, Skeleton } from "../../ds";
import { euro, momento, SOURCE_LABELS } from "../../format";
import { useUsers } from "../../hooks";
import type { RevisioneApi } from "../../types";
import { Gruppo, Voce } from "./numeri/righe";
import { SegmentiOggi } from "./SegmentiOggi";

type Decisioni = [string, string, string];
const GIORNO_MESE = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" });
const COMMENTO: Record<RevisioneApi["commentoStato"], string> = {
  nessuno: "", in_coda: "Claude scrive il commento: qualche minuto", in_corso: "Claude sta scrivendo il commento", pronto: "",
  errore: "Il commento non è arrivato: riprova", fermo_tetto: "Commento fermo: Claude ha raggiunto il tetto del mese",
};
const SEGNAPOSTO = ["Scrivi la prima decisione", "Scrivi la seconda decisione", "Scrivi la terza decisione"];

// Spec 6.4, scheda Lunedì: numeri della settimana chiusa, cosa è fermo, soldi, tre decisioni, commento facoltativo.
// Una sola azione primaria: "Chiudi la revisione". A revisione chiusa nessun primario.
export function Lunedi() {
  const qc = useQueryClient();
  const utenti = useUsers();
  const q = useQuery({
    queryKey: ["lunedi", "corrente"],
    queryFn: () => api<RevisioneApi>("/weekly-reviews/corrente"),
    refetchInterval: (d) => (d.state.data?.commentoStato === "in_coda" || d.state.data?.commentoStato === "in_corso" ? 30_000 : false),
  });
  const [decisioni, setDecisioni] = useState<Decisioni>(["", "", ""]);
  // Le decisioni si caricano una volta per revisione: i rinfreschi del commento non cancellano quello che si sta scrivendo.
  useEffect(() => { if (q.data) setDecisioni(q.data.decisioni); }, [q.data?.id]);
  const salva = useMutation({
    mutationFn: (corpo: { decisioni: Decisioni; chiudi?: true }) => api<RevisioneApi>(`/weekly-reviews/${q.data!.id}`, { method: "PATCH", json: corpo }),
    onSuccess: (d, v) => { qc.setQueryData(["lunedi", "corrente"], d); if (v.chiudi) toast.success("Revisione chiusa"); },
    onError: (e) => toast.error(e.message),
  });
  const commento = useMutation({
    mutationFn: () => api<RevisioneApi>(`/weekly-reviews/${q.data!.id}/commento`, { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(["lunedi", "corrente"], d),
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <Skeleton righe={8} />;
  if (q.error || !q.data) return <Errore errore={q.error} onRiprova={() => void q.refetch()} />;
  const r = q.data;
  const n = r.numeri;
  const chiusa = r.chiusaAt != null;
  const nomeDi = (id: string | null) => utenti.data?.find((u) => u.id === id)?.name ?? id ?? "";
  const salvaDecisioni = () => {
    if (!chiusa && decisioni.some((d, i) => d !== r.decisioni[i])) salva.mutate({ decisioni });
  };
  const fermi = n.fermi.length + n.proposteFerme.length;
  const scrivendo = r.commentoStato === "in_coda" || r.commentoStato === "in_corso";
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-4">
      <Intestazione titolo="Lunedì" numero={n.arrivati} coda="lead" eyebrow={`Settimana dal ${GIORNO_MESE.format(n.da)} al ${GIORNO_MESE.format(n.a - 1)}`} />
      <SegmentiOggi attivo="lunedi" />
      <Gruppo titolo="Numeri della settimana">
        <Voce nome="Lead arrivati" numero={n.arrivati} />
        {n.perFonte.map((f) => <Voce key={f.source} nome={`Di cui da ${SOURCE_LABELS[f.source] ?? f.source}`} numero={f.n} />)}
        <Voce nome="Costo per lead del mese" numero={n.costoPerLeadCents == null ? "n.d." : euro(n.costoPerLeadCents)} />
        <Voce nome="Call di conoscenza" numero={n.conoscenza} />
        <Voce nome="Call di presentazione" numero={n.presentazione} />
        <Voce nome="Proposte" numero={n.proposte} />
        <Voce nome="Vinti" numero={n.vinti} />
      </Gruppo>
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-titolo-blocco">Cosa è fermo</h2>
          <span className="text-meta text-grigio tabular-nums">{fermi}</span>
        </div>
        {fermi === 0 ? <p className="text-secondaria text-grigio">Niente di fermo.</p> : (
          <div className="flex flex-col gap-2">
            {n.fermi.map((f) => <Riga key={f.id} titolo={f.company} meta={`fermo da ${f.giorni} giorni`} href={`/commerciale/lead/${f.id}`} />)}
            {n.proposteFerme.map((p) => <Riga key={p.id} titolo={p.company} meta={`proposta senza risposta da ${p.giorni} giorni`} href={p.leadId ? `/commerciale/lead/${p.leadId}` : "/commerciale/proposte"} />)}
          </div>
        )}
      </section>
      <Gruppo titolo="Soldi">
        <Voce nome="Ricorrente firmato" numero={`${euro(n.ricorrenteCents)} su ${euro(n.obiettivoCents)}`} />
        <Voce nome="Spesa ads del mese" numero={euro(n.spesaAdsMeseCents)} />
      </Gruppo>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-titolo-blocco">Tre decisioni</h2>
        {decisioni.map((d, i) => (
          <AreaTesto
            key={i}
            etichetta={`Decisione ${i + 1}`}
            value={d}
            maxLength={300}
            disabled={chiusa}
            placeholder={SEGNAPOSTO[i]}
            onChange={(e) => setDecisioni((x) => x.map((v, j) => (j === i ? e.target.value : v)) as Decisioni)}
            onBlur={salvaDecisioni}
          />
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-titolo-blocco">Commento di Claude</h2>
        {r.commento && <p className="whitespace-pre-line text-corpo">{r.commento}</p>}
        {COMMENTO[r.commentoStato] && <p className="text-secondaria text-grigio">{COMMENTO[r.commentoStato]}</p>}
        {!r.commento && !COMMENTO[r.commentoStato] && <p className="text-secondaria text-grigio">Facoltativo: Claude legge solo i numeri e le decisioni.</p>}
        {!chiusa && !scrivendo && (
          <div><Pulsante variante="secondario" inCorso={commento.isPending} onClick={() => commento.mutate()}>{r.commento ? "Riscrivi il commento" : "Scrivi il commento"}</Pulsante></div>
        )}
      </section>
      {chiusa ? (
        <p className="text-meta text-grigio">Chiusa da {nomeDi(r.chiusaDa)} {momento(r.chiusaAt!)}</p>
      ) : (
        <div className="sticky bottom-20 md:bottom-4">
          <Pulsante variante="primario" misura="lg" className="w-full md:w-auto" inCorso={salva.isPending && salva.variables?.chiudi === true}
            onClick={() => salva.mutate({ decisioni, chiudi: true })}>Chiudi la revisione</Pulsante>
        </div>
      )}
    </div>
  );
}
