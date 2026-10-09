import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Contatto, Errore, Intestazione, Pulsante, Skeleton, Tag } from "../../ds";
import { euro, momento, quando } from "../../format";
import { useModelli, useOra } from "../../hooks";
import type { Activity, LeadDetail, PropostaRiga } from "../../types";
import { avviaContatto } from "./chiamata";
import { FoglioAccettazione, FoglioLinkPdf, aggiornaDopoProposta } from "./FoglioProposta";
import { compila, modelloPer } from "./modelli";
import { STATI, prezzo } from "./Proposte";

type Dettaglio = { proposta: PropostaRiga; ricontatti: number[]; storico: Activity[] };

function Blocco({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-etichetta uppercase text-grigio">{titolo}</h2>
      {children}
    </section>
  );
}

export function DettaglioProposta({ ora: oraFissa }: { ora?: number } = {}) {
  const { id = "" } = useParams();
  const ora = useOra(60_000, oraFissa);
  const qc = useQueryClient();
  const modelli = useModelli().data;
  const [foglio, setFoglio] = useState<"accettata" | "pdf" | null>(null);
  const [chiede, setChiede] = useState(false);
  const q = useQuery({ queryKey: ["proposta", id], queryFn: () => api<Dettaglio>(`/proposals/${id}`) });
  const leadId = q.data?.proposta.leadId ?? null;
  const lead = useQuery({ queryKey: ["lead", leadId], queryFn: () => api<LeadDetail>(`/leads/${leadId}`), enabled: !!leadId });
  const stato = useMutation({
    mutationFn: (s: PropostaRiga["status"]) => api(`/proposals/${id}`, { method: "PATCH", json: { status: s } }),
    onSuccess: (_, s) => { toast.success(`Proposta segnata ${STATI[s].toLowerCase()}`); setChiede(false); aggiornaDopoProposta(qc, id, leadId); },
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={6} /></div>;
  if (q.error || !q.data) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;

  const { proposta: p, ricontatti, storico } = q.data;
  const l = lead.data?.lead;
  // PV3: il follow-up è il modello email della proposta, compilato con referente, azienda e numero; si registra il suo id.
  const fu = modelloPer(modelli, "email", null, "follow_up_preventivo");
  const v = { contactName: l?.contactName ?? null, company: p.company, numero: p.number };
  const dovuto = p.status === "presentata" && p.nextActionAt != null && p.nextActionAt <= ora;
  const scrivi = dovuto && l && (l.email || l.phone);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 p-4">
      <Intestazione titolo={p.company || p.number} eyebrow={p.number}>
        <p><Tag>{STATI[p.status]}</Tag></p>
      </Intestazione>

      <Blocco titolo="Prezzo">
        <p className="text-corpo tabular-nums">{prezzo(p)}</p>
        {p.hoursEstimate != null && <p className="text-secondaria text-grigio tabular-nums">{p.hoursEstimate} ore stimate</p>}
        {p.option === "standard" && p.alternativeCents != null && <p className="text-secondaria text-grigio tabular-nums">Con la proprietà del codice: {euro(p.alternativeCents)}</p>}
        {p.validUntil != null && <p className="text-secondaria text-grigio tabular-nums">Valida fino a {quando(p.validUntil, ora)}</p>}
      </Blocco>

      {(p.status === "registrata" || p.status === "presentata") && ricontatti.length > 0 && (
        <Blocco titolo="Ricontatti">
          {ricontatti.map((r, i) => <p key={r} className="text-secondaria tabular-nums">{i + 1}° ricontatto {quando(r, ora)}</p>)}
        </Blocco>
      )}

      {p.objections && (
        <Blocco titolo="Obiezioni"><p className="text-secondaria">{p.objections}</p></Blocco>
      )}

      <Blocco titolo="PDF">
        {p.pdfUrl ? (
          <a className="self-start text-corpo font-semibold text-accento-testo underline underline-offset-4" href={p.pdfUrl} target="_blank" rel="noreferrer">Apri il PDF</a>
        ) : (
          <>
            <p className="text-secondaria">Nel wiki</p>
            {p.sourcePath && <p className="break-all text-meta text-grigio">{p.sourcePath}</p>}
          </>
        )}
        <Pulsante variante="fantasma" className="self-start px-0!" onClick={() => setFoglio("pdf")}>{p.pdfUrl ? "Cambia il link al PDF" : "Aggiungi il link al PDF"}</Pulsante>
      </Blocco>

      <div className="flex flex-col gap-2" role="group" aria-label="Azioni">
        {p.status === "registrata" && (
          <Pulsante variante="primario" misura="lg" inCorso={stato.isPending} onClick={() => stato.mutate("presentata")}>Segna presentata</Pulsante>
        )}
        {p.status === "presentata" && (
          <>
            {scrivi && (
              <div className="flex">
                {l.email ? (
                  <Contatto tipo="email" lead={l} variante="primario" misura="lg" oggetto={compila(fu?.subject, v)} testo={compila(fu?.body, v)} onAvvio={() => avviaContatto(l.id, "email", fu?.id)} />
                ) : (
                  <Contatto tipo="chiama" lead={l} variante="primario" misura="lg" onAvvio={() => avviaContatto(l.id, "chiamata")} />
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Pulsante variante={scrivi ? "secondario" : "primario"} misura="lg" className="flex-1" onClick={() => setFoglio("accettata")}>Segna accettata</Pulsante>
              <Pulsante variante={chiede ? "distruttivo" : "secondario"} misura="lg" className="flex-1" inCorso={stato.isPending}
                onClick={() => (chiede ? stato.mutate("rifiutata") : setChiede(true))}>
                {chiede ? "Tocca di nuovo per segnarla rifiutata" : "Segna rifiutata"}
              </Pulsante>
            </div>
          </>
        )}
        {p.leadId && <Link to={`/commerciale/lead/${p.leadId}`} className="self-start py-2 text-secondaria font-semibold underline underline-offset-4">Apri la scheda del lead</Link>}
      </div>

      <Blocco titolo="Storico">
        {storico.length === 0 ? <p className="text-secondaria text-grigio">Nessuna voce.</p> : (
          <ul className="flex flex-col gap-3">
            {storico.map((a) => (
              <li key={a.id} className="flex flex-col">
                <span className="text-secondaria">{a.body}</span>
                <span className="text-meta text-grigio tabular-nums">{momento(a.createdAt, ora)}{a.authorName ? `, ${a.authorName}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Blocco>

      {foglio === "accettata" && <FoglioAccettazione proposta={p} onChiudi={() => setFoglio(null)} />}
      {foglio === "pdf" && <FoglioLinkPdf proposta={p} onChiudi={() => setFoglio(null)} />}
    </div>
  );
}
