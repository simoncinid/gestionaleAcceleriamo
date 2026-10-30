import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Errore, Intestazione, Pulsante, Riga, Skeleton } from "../../ds";
import { conArticolo, euro, momento, SOURCE_LABELS } from "../../format";
import { partiRoma } from "../../../worker/lib/roma";
import { useUsers } from "../../hooks";
import type { RevisioneApi } from "../../types";
import { Gruppo, Voce } from "./numeri/righe";

type Decisioni = [string, string, string];
const GIORNO_MESE = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" });
const COMMENTO: Record<RevisioneApi["commentoStato"], string> = {
  nessuno: "", in_coda: "Sto scrivendo il commento: qualche minuto", in_corso: "Sto scrivendo il commento", pronto: "",
  errore: "Il commento non è arrivato: riprova", fermo_tetto: "Assistente al tetto del mese: il commento riparte il mese prossimo",
};
// Con "Riscrivi" il commento di prima resta (voce 23): lo stato parla del nuovo, il vecchio si legge sotto.
const COMMENTO_NUOVO: Partial<Record<RevisioneApi["commentoStato"], string>> = {
  in_coda: "Nuovo commento in preparazione", in_corso: "Nuovo commento in preparazione",
  errore: "Il nuovo commento non è arrivato: riprova", fermo_tetto: "Nuovo commento fermo: assistente al tetto del mese",
};

// Voce 26: le richieste partono una dopo l'altra, così la chiusura non supera il salvataggio delle decisioni al blur.
export function fila() {
  let coda: Promise<unknown> = Promise.resolve();
  return <T,>(f: () => Promise<T>): Promise<T> => {
    const p = coda.then(f, f);
    coda = p.catch(() => undefined);
    return p;
  };
}

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
  const ordine = useRef(fila()).current;
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
    if (!chiusa && decisioni.some((d, i) => d !== r.decisioni[i])) void ordine(() => salva.mutateAsync({ decisioni })).catch(() => undefined);
  };
  const fermi = n.fermi.length + n.proposteFerme.length;
  const scrivendo = r.commentoStato === "in_coda" || r.commentoStato === "in_corso";
  const precedente = r.commento != null && COMMENTO_NUOVO[r.commentoStato] != null;
  const statoCommento = precedente ? COMMENTO_NUOVO[r.commentoStato] : COMMENTO[r.commentoStato];
  return (
    <div className="flex flex-col gap-6 p-4 md:p-0 md:pb-8">
      <Intestazione titolo="Lunedì" numero={n.arrivati} coda="lead" eyebrow={`Settimana ${conArticolo("dal", partiRoma(n.da).giorno, GIORNO_MESE.format(n.da))} ${conArticolo("al", partiRoma(n.a - 1).giorno, GIORNO_MESE.format(n.a - 1))}`} />
      {/* Schermo largo: a sinistra numeri, soldi, decisioni e commento; a destra l'elenco (lungo) di ciò che è fermo. */}
      <div className="flex flex-col gap-6 @5xl:grid @5xl:grid-cols-2 @5xl:grid-rows-[auto_auto_auto_auto_1fr] @5xl:items-start @5xl:gap-x-8">
      <div className="@5xl:col-start-1">
      <Gruppo titolo="Numeri della settimana">
        <Voce nome="Lead arrivati" numero={n.arrivati} />
        {n.perFonte.map((f) => <Voce key={f.source} nome={f.source === "manuale" ? "Di cui a mano" : `Di cui da ${SOURCE_LABELS[f.source] ?? f.source}`} numero={f.n} />)}
        <Voce nome="Costo per lead del mese" numero={n.costoPerLeadCents == null ? "n.d." : euro(n.costoPerLeadCents)} />
        <Voce nome="Call di conoscenza" numero={n.conoscenza} />
        <Voce nome="Call dell'offerta" numero={n.offerta} />
        <Voce nome="Call di analisi" numero={n.analisi} />
        <Voce nome="Call del progetto" numero={n.progetto} />
        <Voce nome="Proposte" numero={n.proposte} />
        <Voce nome="Vinti" numero={n.vinti} />
      </Gruppo>
      </div>
      <section className="flex flex-col gap-2 @5xl:col-start-2 @5xl:row-span-5 @5xl:row-start-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="segno font-display text-sezione">Cosa è fermo</h2>
          <span className="text-nota text-grigio tabular-nums">{fermi}</span>
        </div>
        {fermi === 0 ? <p className="text-nota text-grigio">Niente di fermo.</p> : (
          <div className="flex flex-col gap-2">
            {n.fermi.map((f) => <Riga key={f.id} titolo={f.company} meta={`fermo da ${f.giorni} giorni`} href={`/commerciale/lead/${f.id}`} />)}
            {n.proposteFerme.map((p) => <Riga key={p.id} titolo={p.company} meta={`proposta senza risposta da ${p.giorni} giorni`} href={p.leadId ? `/commerciale/lead/${p.leadId}` : "/commerciale/proposte"} />)}
          </div>
        )}
      </section>
      <div className="@5xl:col-start-1">
      <Gruppo titolo="Soldi">
        <Voce nome="Ricorrente firmato" numero={`${euro(n.ricorrenteCents)} su ${euro(n.obiettivoCents)}`} />
        <Voce nome="Spesa ads del mese" numero={euro(n.spesaAdsMeseCents)} />
      </Gruppo>
      </div>
      <section className="flex flex-col gap-3 @5xl:col-start-1">
        <h2 className="segno font-display text-sezione">Tre decisioni</h2>
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
      <section className="flex flex-col gap-2 @5xl:col-start-1">
        <h2 className="segno font-display text-sezione">Commento dell'assistente</h2>
        {statoCommento && <p className="text-nota text-grigio">{statoCommento}</p>}
        {precedente && <p className="text-nota text-grigio">Commento precedente</p>}
        {r.commento && <p className="whitespace-pre-line text-testo">{r.commento}</p>}
        {!r.commento && !statoCommento && <p className="text-nota text-grigio">Facoltativo: l'assistente legge solo i numeri e le decisioni.</p>}
        {!chiusa && !scrivendo && r.commentoStato !== "fermo_tetto" && (
          <div><Pulsante variante="secondario" inCorso={commento.isPending} onClick={() => commento.mutate()}>{r.commento ? "Riscrivi il commento" : "Scrivi il commento"}</Pulsante></div>
        )}
      </section>
      </div>
      {chiusa ? (
        <p className="text-nota text-grigio">Chiusa da {nomeDi(r.chiusaDa)} {momento(r.chiusaAt!)}</p>
      ) : (
        <div className="sticky bottom-20 -mx-4 bg-crema px-4 py-3 md:bottom-4">
          <Pulsante variante="primario" misura="lg" className="w-full md:w-auto" inCorso={salva.isPending && salva.variables?.chiudi === true}
            onClick={() => void ordine(() => salva.mutateAsync({ decisioni, chiudi: true })).catch(() => undefined)}>Chiudi la revisione</Pulsante>
        </div>
      )}
    </div>
  );
}
