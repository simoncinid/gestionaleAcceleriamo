import { AZIONE_CALL } from "../../../worker/regole/fasi-call";
import { ArrowLeft } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { api } from "../../api";
import { Errore, Pulsante, Skeleton, classiPulsante } from "../../ds";
import { useOra } from "../../hooks";
import type { CallAgenda, LeadDetail, RigaContatto as Contatto } from "../../types";
import { FoglioEsito } from "./FoglioEsito";
import { dataEOra } from "./lead/daFare";
import { FoglioSpostaCall } from "./lead/FoglioSpostaCall";
import { RigaContatto } from "./lead/RigaContatto";
import { Sezione, Voce } from "./lead/Sezione";
import { ELENCO, LINK, SECONDARIO } from "./lead/stile";

const DURATA = 30 * 60_000;
const TIPO = AZIONE_CALL;
const STATO = { fatta: "Fatta", saltata: "Non si è presentato", rimandata: "Rimandata" } as const;

// Pagina di una call, /commerciale/call/:id (contratto blocco 1, modifica 13). Una sezione con i dati della call,
// un'azione primaria secondo l'ora: prima apri la videochiamata, dopo segna com'è andata.
export function DettaglioCall({ ora: oraFissa }: { ora?: number } = {}) {
  const { id = "" } = useParams();
  const vai = useNavigate();
  const { key } = useLocation();
  const ora = useOra(60_000, oraFissa);
  const [foglio, setFoglio] = useState<null | "esito" | "sposta" | "link">(null);
  const q = useQuery({ queryKey: ["call", id], queryFn: () => api<{ call: CallAgenda; contatto: Contatto }>(`/calls/${id}`) });
  const leadId = q.data?.call.leadId;
  const lead = useQuery({ queryKey: ["lead", leadId], queryFn: () => api<LeadDetail>(`/leads/${leadId}`), enabled: foglio === "esito" && !!leadId });

  if (q.isLoading) return <div className="p-4 md:p-0 md:pb-8"><Skeleton righe={5} /></div>;
  if (q.error || !q.data) return <div className="p-4 md:p-0 md:pb-8"><Errore errore={q.error ?? new Error("Call non trovata")} onRiprova={() => void q.refetch()} /></div>;
  const { call, contatto } = q.data;
  const finita = ora > call.scheduledAt + DURATA;
  const daFare = call.outcome == null;
  const chiudi = () => { setFoglio(null); void q.refetch(); };

  const primario = !daFare ? null
    : !finita && call.meetLink
      ? <a href={call.meetLink} target="_blank" rel="noreferrer" data-variante="primario" className={`${classiPulsante("primario", "lg")} w-full sm:w-auto`}>Apri la videochiamata</a>
      : <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto" onClick={() => setFoglio("esito")}>Segna com'è andata</Pulsante>;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-0 md:pb-8">
      <header className="flex items-start gap-3">
        <Pulsante variante="icona" aria-label="Torna indietro" title="Torna indietro" className="w-11 shrink-0 px-0!" icona={<ArrowLeft size={22} weight="bold" aria-hidden />}
          onClick={() => (key === "default" ? vai("/commerciale/call") : vai(-1))} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="break-words text-pagina">{TIPO[call.kind]}</h1>
          <RigaContatto contatto={contatto} />
        </div>
      </header>

      <div className="grid max-w-[720px] gap-6">
        <Sezione titolo="La call" nome="call">
          <dl className={ELENCO}>
            <Voce etichetta="Quando"><span className="tabular-nums">{dataEOra(call.scheduledAt)}</span></Voce>
            <Voce etichetta="Dove">
              {call.meetLink
                ? <a className={`${LINK} break-all`} href={call.meetLink} target="_blank" rel="noreferrer">Google Meet</a>
                : <button type="button" className={LINK} onClick={() => setFoglio("link")}>Aggiungi il link della call</button>}
            </Voce>
            <Voce etichetta="Stato">{call.outcome ? STATO[call.outcome] : finita ? "Da segnare" : "In programma"}</Voce>
            {call.contactName && <Voce etichetta="Persona">{call.contactName}</Voce>}
            {call.notes && <Voce etichetta="Note"><span className="whitespace-pre-line">{call.notes}</span></Voce>}
          </dl>
          {(primario || daFare) && (
            <div className="flex flex-col gap-2 border-t border-[#E5DED4] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
              {primario}
              {daFare && <Pulsante variante="fantasma" onClick={() => setFoglio("sposta")}>Sposta la call</Pulsante>}
              <a className={classiPulsante("fantasma", "md")} href={`/api/calls/${call.id}/ics`}>Scarica l'invito</a>
            </div>
          )}
          {!daFare && <p className={SECONDARIO}>Com'è andata è nello storico del lead.</p>}
        </Sezione>
      </div>

      {(foglio === "sposta" || foglio === "link") && <FoglioSpostaCall leadId={call.leadId} call={call} soloLink={foglio === "link"} onChiudi={chiudi} />}
      {foglio === "esito" && lead.data && (
        <FoglioEsito lead={{ id: lead.data.lead.id, company: lead.data.lead.company, contactName: lead.data.lead.contactName, stageId: lead.data.lead.stageId, attemptCount: lead.data.lead.attemptCount, email: lead.data.lead.email, setupCents: lead.data.lead.setupCents, feeCents: lead.data.lead.feeCents }} onChiudi={chiudi} />
      )}
    </div>
  );
}
