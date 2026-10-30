import { ArrowLeft, DotsThree } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Errore, Foglio, Pulsante, Riga, Skeleton } from "../../ds";
import { useOra, useStages, useUsers } from "../../hooks";
import type { CallAgenda, LeadDetail, Stage } from "../../types";
import type { CollegamentiScheda } from "../../../worker/leads/collegamenti";
import { FoglioNuovaAutomazione } from "../automazioni/FoglioAutomazione";
import { FoglioNuovoCanone } from "../economia/Fogli";
import { AZIONE_CALL, CALL_DEL_CODICE, callPerFase } from "../../../worker/regole/fasi-call";
import type { CallKind } from "../../../worker/db/schema";
import { FoglioAvvioLavoro } from "../lavori/FoglioAvvioLavoro";
import { FoglioCall } from "./FoglioCall";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioNuovoCliente } from "./FoglioCliente";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFissaCall } from "./FoglioFissaCall";
import { FoglioPropostaManuale } from "./FoglioProposta";
import { FoglioRimanda } from "./FoglioRimanda";
import { FoglioScrivi } from "./FoglioScrivi";
import { Assistente } from "./lead/Assistente";
import { Collegamenti } from "./lead/Collegamenti";
import { PassaggioCliente } from "./lead/Passaggio";
import { Contatti } from "./lead/Contatti";
import { DatiLead } from "./lead/DatiLead";
import { Documents } from "./lead/Documents";
import { useCaricaUno } from "./lead/CaricaUno";
import { useTaskDelLead } from "./lead/taskLead";
import { smista } from "./lead/documentiScheda";
import { Preventivo } from "./lead/Preventivo";
import { FoglioFase } from "./lead/FoglioFase";
import { LeadForm } from "./lead/LeadForm";
import { FoglioSpostaCall } from "./lead/FoglioSpostaCall";
import { NextActionCard, type ComandoScheda, type ModoCall } from "./lead/NextActionCard";
import { poiSeRiesce } from "./lead/salvataggi";
import { Sezione } from "./lead/Sezione";
import { LINK } from "./lead/stile";
import { EtichettaFase, faseDi } from "./EtichettaFase";
import { Timeline } from "./lead/Timeline";
import { confermaNonPartita, idPerPreventivo } from "./scheda";
import { useCambioFase } from "./StepperFasi";
import { useNonPresentato } from "./nonPresentato";

type QualeFoglio = null | "menu" | "esito" | "fissa" | "whatsapp" | "email" | "avvio" | "dati" | "documenti" | "responsabile" | "fase" | "dettagli" | "collegamenti" | "assistente" | "storico"
  | "sposta" | "link" | "rimanda" | "proposta" | "automazione" | "canone" | { fase: Stage } | { fissa: CallKind } | { call: CallAgenda; modo: ModoCall };

// Avviso in riga in cima alla scheda: una frase, al massimo un link. Mai finestre del browser.
function Avviso({ children }: { children: ReactNode }) {
  return <div role="status" className="flex flex-wrap items-center gap-x-3 rounded-[10px] border border-[#E5DED4] bg-white px-5 py-2 text-testo">{children}</div>;
}

export function SchedaLeadRotta() {
  const { id = "" } = useParams();
  return <SchedaLead key={id} id={id} />;
}

// Vista operativa a tutta altezza: azione e contatti sempre disponibili, dettagli nei fogli.
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
  const coll = useQuery({ queryKey: ["lead", id, "collegamenti"], queryFn: () => api<CollegamentiScheda>(`/leads/${id}/collegamenti`), enabled: !uscito });
  // Apertura della scheda: azzera il pallino dei documenti e tiene le novità di prima per mostrarle qui (spec documenti 29/10/2026).
  // Chiave fuori da ["lead"]: gli aggiornamenti della scheda non la rifanno, si rifà solo riaprendo la scheda.
  const visto = useQuery({
    queryKey: ["visto", id],
    queryFn: async () => {
      const r = await api<{ novita: number; nuovi: string[] }>(`/leads/${id}/visto`, { method: "POST" });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      return r;
    },
    enabled: !uscito, staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const conferma = useMutation({
    mutationFn: (activityId: string) => api(`/leads/${id}/inviti/${activityId}/conferma`, { method: "POST" }),
    onSuccess: () => { toast.success("Call confermata"); for (const k of [["lead", id], ["leads"], ["today"], ["badge"], ["calls"]]) void qc.invalidateQueries({ queryKey: k }); },
    onError: (e) => toast.error(e.message),
  });
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
  const nonPresentato = useNonPresentato();
  const caricaUno = useCaricaUno();
  const taskLead = useTaskDelLead(id);
  const unisci = useMutation({
    mutationFn: (intoId: string) => api<{ lead: { id: string } }>(`/leads/${id}/merge`, { method: "POST", json: { intoId } }),
    onSuccess: ({ lead }) => { esci(); toast.success("Lead uniti"); vai(`/commerciale/lead/${lead.id}`); },
    onError: (e) => toast.error(e.message),
  });

  if (d.isLoading) return <div className="pb-8"><Skeleton righe={8} /></div>;
  if (d.error || !d.data) return <div className="pb-8"><Errore errore={d.error ?? new Error("Lead non trovato")} onRiprova={() => void d.refetch()} /></div>;
  const { lead, activities, documents, duplicateOf } = d.data;
  const chiudi = () => { setFoglio(null); setChiede(null); };
  // Ogni documento in un posto solo: registrazioni sotto la call, preventivi nel loro blocco, il resto nel foglio.
  // Task aperte: finché la lista non è arrivata, i documenti delle task restano fuori da Documenti (niente lampi di doppioni).
  const aperteTask = taskLead.data ? taskLead.data.task.filter((t) => t.doneAt == null).map((t) => t.id) : documents.map((x) => x.taskId).filter((x): x is string => !!x);
  const { perCall, perTask, preventivi, altri } = smista(documents, (coll.data?.call ?? []).map((k) => k.id), aperteTask);
  const nuovi = visto.data?.nuovi ?? [];
  const novitaAltri = altri.filter((x) => nuovi.includes(x.id)).length;
  const enc = encodeURIComponent;
  // La call in programma (la prima non ancora fatta) e l'ultima proposta: link in linea nel Da fare.
  // Prima quella all'ora dell'appuntamento del lead (è la stessa della riga Da fare), poi la prima ancora da fare.
  const aperte = (coll.data?.call ?? []).filter((c) => c.outcome == null).sort((a, b) => a.scheduledAt - b.scheduledAt);
  const trovata = aperte.find((c) => c.scheduledAt === lead.appointmentAt) ?? aperte[0];
  const prossimaCall = trovata ? { id: trovata.id, scheduledAt: trovata.scheduledAt, meetLink: lead.meetLink } : null;
  const ultimaProposta = coll.data?.proposte[0] ?? null;
  const kindCall = callPerFase(lead.stageId) ?? "conoscenza";
  // Ogni codice della tabella apre il suo foglio; chiamare, aprire la videochiamata e il cliente sono link nel Da fare.
  const comando = (c: ComandoScheda) => {
    if (c.startsWith("segna_")) setFoglio("esito");
    else if (CALL_DEL_CODICE[c]) setFoglio({ fissa: CALL_DEL_CODICE[c] });
    else if (c === "sposta_call") setFoglio(prossimaCall ? "sposta" : { fissa: kindCall });
    else if (c === "aggiungi_link") setFoglio(prossimaCall ? "link" : { fissa: kindCall });
    else if (c === "non_presentato") nonPresentato.mutate({ leadId: lead.id, kind: kindCall });
    else if (c === "rimanda") setFoglio("rimanda");
    else if (c === "riapri") setFoglio("fase");
    else if (c === "apri_cliente") setCreaCliente(true);
    else if (c === "crea_proposta") setFoglio("proposta");
  };
  const leadEsito = { id: lead.id, company: lead.company, contactName: lead.contactName, stageId: lead.stageId, attemptCount: lead.attemptCount, email: lead.email };

  return (
    <div className="lead-workspace flex h-full min-h-0 flex-col gap-3">
      <header className="lead-heading flex shrink-0 items-center gap-3">
        {/* Si torna da dove si è venuti (la tabella ritrova i filtri); aperta da un link diretto, la scheda torna alla tabella. */}
        <Pulsante variante="icona" aria-label="Torna indietro" title="Torna indietro" className="w-11 shrink-0 px-0!" icona={<ArrowLeft size={22} weight="bold" aria-hidden />}
          onClick={() => (chiaveStoria === "default" ? vai("/commerciale/lead") : vai(-1))} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate font-sans text-[22px] font-semibold leading-tight tracking-[-0.01em]" title={lead.company}>{lead.company}</h1>
          <div className="flex flex-wrap items-center gap-x-3">
            <button type="button" onClick={() => setFoglio("fase")} aria-label={`Fase: ${fase?.label ?? lead.stageId}. Cambia fase`} className="inline-flex min-h-8 min-w-0 items-center hover:[&>span]:brightness-95">
              <EtichettaFase {...faseDi(fasi.data, lead.stageId)} freccia />
            </button>
          </div>
          {fase?.kind === "won" && coll.data?.cliente && <PassaggioCliente clienteId={coll.data.cliente.id} dal={coll.data.cliente.dal} />}
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
      {(coll.data?.inviti ?? []).map((inv) => (
        <Avviso key={inv.id}>
          <span>{inv.body}</span>
          <Pulsante variante="secondario" inCorso={conferma.isPending && conferma.variables === inv.id} onClick={() => conferma.mutate(inv.id)}>Conferma</Pulsante>
        </Avviso>
      ))}
      {confermaNonPartita(lead) && (
        <Avviso>
          <span className="font-semibold">Email di conferma non partita</span>
          <span className="break-words text-[#6B645C]">{lead.confirmationError ?? "Motivo non registrato"}</span>
        </Avviso>
      )}

      <nav aria-label="Dettagli del lead" className="lead-tools grid shrink-0 grid-cols-4 gap-2">
        <button type="button" onClick={() => setFoglio("dettagli")}>Dati e note</button>
        <button type="button" onClick={() => setFoglio("documenti")}>Documenti <span>{altri.length}{novitaAltri > 0 ? " •" : ""}</span></button>
        <button type="button" onClick={() => setFoglio("collegamenti")}>Collegamenti <span>{coll.data ? coll.data.call.length + coll.data.proposte.length + coll.data.automazioni.length + coll.data.canoni.length + Number(!!coll.data.cliente) : "…"}</span></button>
        <button type="button" onClick={() => setFoglio("assistente")}>Assistente</button>
      </nav>

      <div className="lead-overview grid shrink-0 gap-3 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <NextActionCard lead={lead} kind={fase?.kind} ora={ora} onComando={comando} onCall={(k, modo) => setFoglio({ call: k, modo })}
              documentiTask={perTask} nuovi={nuovi} caricando={caricaUno.inCorso === "Documento della cosa da fare caricato"}
              onCaricaTask={(taskId, doc) => caricaUno.avvia((n) => (doc ? `/documents/${doc}/versioni?nome=${enc(n)}` : `/leads/${lead.id}/documents?nome=${enc(n)}&task=${enc(taskId)}`), "Documento della cosa da fare caricato")}
              inLinea={{ call: prossimaCall, proposta: ultimaProposta, cliente: d.data.cliente ? { id: d.data.cliente.id, name: d.data.cliente.name } : null }} />
            {/* Preventivo sotto il Da fare (giro 1, approvato da Tommaso): si vede solo se c'è un preventivo o una proposta. */}
            <div className="mt-3 empty:hidden">
              <Preventivo preventivi={preventivi} proposta={ultimaProposta} nuovi={nuovi} ora={ora} inCorso={caricaUno.inCorso != null}
                onCarica={() => caricaUno.avvia((n) => `/leads/${lead.id}/documents?nome=${enc(n)}&tipo=preventivo`, "Preventivo caricato")}
                onNuovaVersione={(p) => caricaUno.avvia((n) => `/documents/${p.id}/versioni?nome=${enc(n)}`, "Nuova versione del preventivo caricata")} />
            </div>
          </div>
          <div className="min-w-0">
            <Contatti lead={lead} onScrivi={setFoglio} onAggiungi={() => setFoglio("dati")} />
          </div>
      </div>
      <Sezione titolo="Storico" nome="storico" className="lead-history min-h-0 flex-1"
        destra={<button type="button" className="text-[13px] font-semibold underline decoration-sabbia-2 underline-offset-4" onClick={() => setFoglio("storico")}>Aggiungi attività</button>}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" tabIndex={0} role="region" aria-label="Cronologia del lead">
          <Timeline leadId={lead.id} activities={activities} ora={ora} compatta />
        </div>
      </Sezione>

      {foglio === "storico" && <Foglio aperto lato titolo="Storico e attività" onChiudi={chiudi}><Timeline leadId={lead.id} activities={activities} ora={ora} /></Foglio>}
      {foglio === "collegamenti" && <Foglio aperto lato titolo="Collegamenti" onChiudi={chiudi}>
        <Collegamenti dati={coll.data} ora={ora} perso={fase?.kind === "lost"}
          onCrea={(a) => setFoglio(a === "call" ? "fissa" : a)}
          documentiCall={perCall} nuovi={nuovi} caricando={caricaUno.inCorso === "Registrazione caricata"}
          onCaricaRegistrazione={(callId) => caricaUno.avvia((n) => `/leads/${lead.id}/documents?nome=${enc(n)}&tipo=registrazione&call=${enc(callId)}`, "Registrazione caricata")} />
      </Foglio>}
      {foglio === "assistente" && <Foglio aperto lato titolo="Assistente" onChiudi={chiudi}><Assistente lead={leadEsito} manuale={lead.source === "manuale"} /></Foglio>}
      {foglio === "dettagli" && <Foglio aperto lato titolo="Dati e note" onChiudi={chiudi}>
        <Pulsante variante="secondario" onClick={() => setFoglio("dati")}>Modifica dati</Pulsante>
        <DatiLead lead={lead} utenti={utenti.data ?? []} documenti={altri.length} novita={novitaAltri}
          onResponsabile={(ownerId) => patch.mutate({ ownerId })}
          onDocumenti={() => setFoglio("documenti")} onModifica={() => setFoglio("dati")} />
      </Foglio>}

      {caricaUno.campo}
      {foglio === "esito" && <FoglioEsito lead={leadEsito} onChiudi={chiudi} />}
      {foglio === "avvio" && d.data.cliente && <FoglioAvvioLavoro leadId={lead.id} clientId={d.data.cliente.id} nomeCliente={d.data.cliente.name} canoneIniziale={lead.feeCents} documenti={d.data.documents} onChiudi={chiudi} />}
      {foglio === "fissa" && <FoglioFissaCall leadId={lead.id} haEmail={Boolean(lead.email)} onChiudi={chiudi} ritorno={menu} />}
      {(foglio === "whatsapp" || foglio === "email") && <FoglioScrivi lead={lead} canale={foglio} onChiudi={chiudi} />}
      {foglio === "fase" && <FoglioFase attuale={lead.stageId} ordinate={cambioFase.ordinate} scegli={cambioFase.scegli} onChiudi={chiudi} />}
      {foglio && typeof foglio === "object" && "fissa" in foglio && (
        <FoglioFissaCall leadId={lead.id} haEmail={!!lead.email} fase={{ label: AZIONE_CALL[foglio.fissa], kind: foglio.fissa }} onChiudi={chiudi} />
      )}
      {(foglio === "sposta" || foglio === "link") && prossimaCall && <FoglioSpostaCall leadId={lead.id} call={prossimaCall} soloLink={foglio === "link"} onChiudi={chiudi} />}
      {foglio && typeof foglio === "object" && "call" in foglio && (foglio.modo === "esito"
        ? <FoglioCall k={foglio.call} onChiudi={chiudi} />
        : <FoglioSpostaCall leadId={lead.id} call={foglio.call} soloLink={foglio.modo === "link"} onChiudi={chiudi} />)}
      {foglio === "rimanda" && <FoglioRimanda leadId={lead.id} onChiudi={() => { chiudi(); void qc.invalidateQueries({ queryKey: ["lead", id] }); }} />}
      {foglio === "automazione" && <FoglioNuovaAutomazione onChiudi={() => { chiudi(); void coll.refetch(); }} />}
      {foglio === "canone" && <FoglioNuovoCanone onChiudi={() => { chiudi(); void coll.refetch(); }} />}
      {foglio === "proposta" && <FoglioPropostaManuale leadIniziale={lead} onChiudi={() => { chiudi(); void qc.invalidateQueries({ queryKey: ["lead", id] }); }} />}
      {foglio && typeof foglio === "object" && "fase" in foglio && (() => {
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
        <Foglio aperto lato titolo="Documenti" onChiudi={chiudi}><Documents leadId={lead.id} documents={altri} ora={ora} nuovi={nuovi} /></Foglio>
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
