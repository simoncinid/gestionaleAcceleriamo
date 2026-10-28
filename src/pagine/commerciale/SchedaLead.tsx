import { ArrowLeft, DotsThree } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Contatto, Errore, Foglio, Pulsante, Riga, Skeleton, classiPulsante } from "../../ds";
import { useOra, useStages, useUsers } from "../../hooks";
import type { LeadDetail, Stage } from "../../types";
import { avviaContatto } from "./chiamata";
import { callPerFase } from "../../../worker/regole/fasi-call";
import { FoglioAvvioLavoro } from "../lavori/FoglioAvvioLavoro";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioNuovoCliente } from "./FoglioCliente";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFissaCall } from "./FoglioFissaCall";
import { FoglioScrivi } from "./FoglioScrivi";
import { Assistente } from "./lead/Assistente";
import { Contatti } from "./lead/Contatti";
import { DatiLead } from "./lead/DatiLead";
import { Documents } from "./lead/Documents";
import { FoglioFase } from "./lead/FoglioFase";
import { LeadForm } from "./lead/LeadForm";
import { NextActionCard } from "./lead/NextActionCard";
import { poiSeRiesce } from "./lead/salvataggi";
import { Sezione } from "./lead/Sezione";
import { LINK, coloreFase } from "./lead/stile";
import { Timeline } from "./lead/Timeline";
import { confermaNonPartita, idPerPreventivo } from "./scheda";
import { useCambioFase } from "./StepperFasi";

type QualeFoglio = null | "menu" | "esito" | "fissa" | "whatsapp" | "email" | "avvio" | "dati" | "documenti" | "responsabile" | "fase" | { fase: Stage };

// Avviso in riga in cima alla scheda: una frase, al massimo un link. Mai finestre del browser.
function Avviso({ children }: { children: ReactNode }) {
  return <div role="status" className="flex flex-wrap items-center gap-x-3 rounded-[10px] border border-[#E5DED4] bg-white px-5 py-2 text-[15px]">{children}</div>;
}

export function SchedaLeadRotta() {
  const { id = "" } = useParams();
  return <SchedaLead key={id} id={id} />;
}

// Scheda del lead, struttura B2 (contratto blocco 1, sezione 3): intestazione pulita, cinque sezioni in contenitori bianchi.
// A due colonne: a sinistra Da fare, Collegamenti, Storico; a destra Contatti, Dati del lead, Assistente.
// In una colonna l'ordine è Da fare, Contatti, Collegamenti, Dati del lead, Storico, Assistente (order sui figli).
export function SchedaLead({ id, ora: oraFissa }: { id: string; ora?: number }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const { key: chiaveStoria } = useLocation();
  const [creaCliente, setCreaCliente] = useState(false);
  const ora = useOra(60_000, oraFissa);
  const fasi = useStages();
  const utenti = useUsers();
  const [foglio, setFoglio] = useState<QualeFoglio>(null);
  // Le azioni che non si annullano chiedono un secondo tocco sulla stessa riga: niente confirm() del browser.
  const [chiede, setChiede] = useState<null | "unisci" | "cestino">(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [uscito, setUscito] = useState(false);
  // Il modulo dati si rimonta solo dopo un suo salvataggio riuscito: gli altri salvataggi non cancellano quello che si scrive.
  const [versione, setVersione] = useState(0);
  const d = useQuery({ queryKey: ["lead", id], queryFn: () => api<LeadDetail>(`/leads/${id}`), enabled: !uscito });
  const fase = fasi.data?.find((f) => f.id === d.data?.lead.stageId);
  const cambioFase = useCambioFase({
    leadId: id, attuale: d.data?.lead.stageId ?? "", fasi: fasi.data ?? [],
    senzaAzione: !d.data?.lead.nextAction || d.data?.lead.nextActionAt == null, onServeFoglio: (f) => setFoglio({ fase: f }),
  });
  const patch = useMutation({
    mutationFn: (json: Record<string, unknown>) => api(`/leads/${id}`, { method: "PATCH", json }),
    onSuccess: () => { toast.success("Salvato"); for (const k of [["lead", id], ["leads"], ["today"], ["badge"]]) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => toast.error(e.message),
  });
  // Il lead cestinato o unito non esiste più: si toglie dalla cache senza rifare la richiesta (darebbe 404).
  const esci = () => {
    setUscito(true);
    qc.removeQueries({ queryKey: ["lead", id] });
    for (const k of ["leads", "today", "stats", "trash", "badge"]) void qc.invalidateQueries({ queryKey: [k] });
  };
  const cestina = useMutation({
    mutationFn: () => api(`/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { esci(); toast.success("Spostato nel cestino"); vai("/commerciale/lead"); },
    onError: (e) => toast.error(e.message),
  });
  const unisci = useMutation({
    mutationFn: (intoId: string) => api<{ lead: { id: string } }>(`/leads/${id}/merge`, { method: "POST", json: { intoId } }),
    onSuccess: ({ lead }) => { esci(); toast.success("Lead uniti"); vai(`/commerciale/lead/${lead.id}`); },
    onError: (e) => toast.error(e.message),
  });

  if (d.isLoading) return <div className="pb-8"><Skeleton righe={8} /></div>;
  if (d.error || !d.data) return <div className="pb-8"><Errore errore={d.error ?? new Error("Lead non trovato")} onRiprova={() => void d.refetch()} /></div>;
  const { lead, activities, documents, duplicateOf } = d.data;
  const chiudi = () => { setFoglio(null); setChiede(null); };
  const leadEsito = { id: lead.id, company: lead.company, contactName: lead.contactName, stageId: lead.stageId, attemptCount: lead.attemptCount, email: lead.email };

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex items-start gap-3">
        {/* Si torna da dove si è venuti (la tabella ritrova i filtri); aperta da un link diretto, la scheda torna alla tabella. */}
        <Pulsante variante="icona" aria-label="Torna indietro" title="Torna indietro" className="w-11 shrink-0 px-0!" icona={<ArrowLeft size={22} weight="bold" aria-hidden />}
          onClick={() => (chiaveStoria === "default" ? vai("/commerciale/lead") : vai(-1))} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="line-clamp-2 break-words font-sans text-[28px] font-semibold leading-[1.15] tracking-[-0.01em]">{lead.company}</h1>
          <div className="flex flex-wrap items-center gap-x-3">
            {lead.contactName && <p className="text-[15px]">{lead.contactName}</p>}
            <button type="button" onClick={() => setFoglio("fase")} aria-label={`Fase: ${fase?.label ?? lead.stageId}. Cambia fase`} className="inline-flex min-h-11 items-center">
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#E5DED4] bg-white px-3 text-[13px] font-semibold hover:border-[#CFC6B9]">
                <span aria-hidden className="size-2 rounded-full" style={{ background: coloreFase(lead.stageId) }} />
                {fase?.label ?? lead.stageId}
              </span>
            </button>
          </div>
        </div>
        <Pulsante ref={menu} variante="icona" aria-label="Altre azioni" title="Altre azioni" className="w-11 shrink-0 px-0!" icona={<DotsThree size={22} weight="bold" aria-hidden />} onClick={() => setFoglio("menu")} />
      </header>

      {duplicateOf && (
        <Avviso>
          <span>Possibile doppione di {duplicateOf.company}:</span>
          <Link className={LINK} to={`/commerciale/lead/${duplicateOf.id}`}>Confronta</Link>
        </Avviso>
      )}
      {lead.metaStatus && lead.metaStatus !== "ok" && <Avviso>I dati del modulo Meta non sono ancora arrivati: riprovo da solo ogni 15 minuti.</Avviso>}
      {confermaNonPartita(lead) && (
        <Avviso>
          <span className="font-semibold">Email di conferma non partita</span>
          <span className="break-words text-[#6B645C]">{lead.confirmationError ?? "Motivo non registrato"}</span>
        </Avviso>
      )}

      <div className="flex flex-col gap-6 @4xl:grid @4xl:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] @4xl:items-start">
        <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-6">
          <div className="order-1 @4xl:order-none">
            <Sezione titolo="Da fare" nome="da-fare">
              <NextActionCard key={`${lead.nextAction}-${lead.nextActionAt}`} lead={lead} kind={fase?.kind} ora={ora} onSave={patch.mutate} pending={patch.isPending} />
              {fase?.kind === "won" && d.data.cliente && <Link to={`/commerciale/clienti/${d.data.cliente.id}`} data-variante="primario" className={classiPulsante("primario", "lg")}>Apri cliente</Link>}
              {fase?.kind === "won" && !d.data.cliente && <Pulsante variante="primario" misura="lg" onClick={() => setCreaCliente(true)}>Crea il cliente</Pulsante>}
              {fase?.kind === "open" && <Contatto tipo="chiama" lead={lead} variante="primario" misura="lg" onAvvio={() => avviaContatto(lead.id, "chiamata")} />}
            </Sezione>
          </div>
          <div className="order-5 @4xl:order-none">
            <Sezione titolo="Storico" nome="storico"><Timeline leadId={lead.id} activities={activities} ora={ora} /></Sezione>
          </div>
        </div>
        <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-6">
          <div className="order-2 @4xl:order-none">
            <Contatti lead={lead} onScrivi={setFoglio} onAggiungi={() => setFoglio("dati")} />
          </div>
          <div className="order-4 @4xl:order-none">
            <DatiLead lead={lead} fasi={fasi.data ?? []} utenti={utenti.data ?? []} documenti={documents.length}
              onServeFoglio={(f) => setFoglio({ fase: f })} onResponsabile={(ownerId) => patch.mutate({ ownerId })}
              onDocumenti={() => setFoglio("documenti")} onModifica={() => setFoglio("dati")} />
          </div>
          <div className="order-6 @4xl:order-none">
            <Assistente lead={leadEsito} manuale={lead.source === "manuale"} />
          </div>
        </div>
      </div>

      {foglio === "esito" && <FoglioEsito lead={leadEsito} onChiudi={chiudi} />}
      {foglio === "avvio" && d.data.cliente && <FoglioAvvioLavoro leadId={lead.id} clientId={d.data.cliente.id} nomeCliente={d.data.cliente.name} canoneIniziale={lead.feeCents} documenti={d.data.documents} onChiudi={chiudi} />}
      {foglio === "fissa" && <FoglioFissaCall leadId={lead.id} haEmail={Boolean(lead.email)} onChiudi={chiudi} ritorno={menu} />}
      {(foglio === "whatsapp" || foglio === "email") && <FoglioScrivi lead={lead} canale={foglio} onChiudi={chiudi} />}
      {foglio === "fase" && <FoglioFase attuale={lead.stageId} ordinate={cambioFase.ordinate} scegli={cambioFase.scegli} onChiudi={chiudi} />}
      {foglio && typeof foglio === "object" && (() => {
        const kind = callPerFase(foglio.fase.id);
        return kind
          ? <FoglioFissaCall leadId={lead.id} haEmail={!!lead.email} fase={{ label: foglio.fase.label, kind }} onChiudi={chiudi} />
          : <FoglioChiusura lead={lead} fase={foglio.fase} onChiudi={chiudi} />;
      })()}
      {foglio === "dati" && (
        <Foglio aperto lato titolo="Modifica dati" onChiudi={chiudi}>
          <LeadForm key={versione} lead={lead} users={utenti.data ?? []} ora={ora} onSave={poiSeRiesce(patch.mutate, () => { setVersione((v) => v + 1); chiudi(); })} pending={patch.isPending} />
        </Foglio>
      )}
      {foglio === "documenti" && (
        <Foglio aperto lato titolo="Documenti" onChiudi={chiudi}><Documents leadId={lead.id} documents={documents} ora={ora} /></Foglio>
      )}
      {foglio === "responsabile" && (
        <Foglio aperto lato titolo="Cambia responsabile" onChiudi={chiudi}>
          <ul className="flex flex-col gap-2">
            {(utenti.data ?? []).map((u) => (
              <li key={u.id}><Riga titolo={u.name} secondaria={u.id === lead.ownerId ? "Responsabile adesso" : undefined}
                onClick={() => { if (u.id !== lead.ownerId) patch.mutate({ ownerId: u.id }); chiudi(); }} /></li>
            ))}
          </ul>
        </Foglio>
      )}
      {creaCliente && <FoglioNuovoCliente daLead={{ id: lead.id, nome: lead.company }} onChiudi={() => { setCreaCliente(false); void d.refetch(); }} />}
      {foglio === "menu" && (
        <Foglio aperto titolo="Altre azioni" onChiudi={chiudi}>
          <ul className="flex flex-col gap-2">
            <li><Riga titolo="Modifica dati" secondaria="Nome, persona, telefono, email, nota" onClick={() => { setChiede(null); setFoglio("dati"); }} /></li>
            <li><Riga titolo="Cambia responsabile" onClick={() => { setChiede(null); setFoglio("responsabile"); }} /></li>
            {duplicateOf && (
              <li><Riga titolo={chiede === "unisci" ? "Tocca di nuovo per unire" : `Unisci con il doppione ${duplicateOf.company}`} secondaria={chiede === "unisci" ? "Storico e documenti passano di là" : undefined}
                onClick={() => (chiede === "unisci" ? unisci.mutate(duplicateOf.id) : setChiede("unisci"))} /></li>
            )}
            <li><Riga titolo="Copia l'id per il preventivo" secondaria={idPerPreventivo(lead.id)}
              onClick={() => { void navigator.clipboard.writeText(idPerPreventivo(lead.id)).then(() => toast.success("Copiato: incollalo nel preventivo"), () => toast.error("Non riesco a copiare: seleziona il testo a mano")); chiudi(); }} /></li>
            <li><Riga titolo={chiede === "cestino" ? "Tocca di nuovo: il lead va nel cestino" : "Sposta nel cestino"} secondaria={chiede === "cestino" ? "Potrai ripristinarlo da Impostazioni, Cestino" : undefined}
              onClick={() => (chiede === "cestino" ? cestina.mutate() : setChiede("cestino"))} /></li>
          </ul>
        </Foglio>
      )}
    </div>
  );
}
