import { ArrowLeft, CaretDown, DotsThree, EnvelopeSimple, WhatsappLogo } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { Proposta } from "../../../worker/regole/motore";
import { api } from "../../api";
import { Contatto, Errore, Foglio, Pulsante, Punto, Riga, Skeleton, classiPulsante } from "../../ds";
import { SOURCE_LABELS, euro, momento, quando, telefonoMostrato } from "../../format";
import { useOra, useStages, useUsers } from "../../hooks";
import type { LeadDetail, Stage } from "../../types";
import { avviaContatto } from "./chiamata";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioNuovoCliente } from "./FoglioCliente";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFissaCall } from "./FoglioFissaCall";
import { FoglioScrivi } from "./FoglioScrivi";
import { Documents } from "./lead/Documents";
import { LeadForm } from "./lead/LeadForm";
import { Dato } from "./lead/Dato";
import { MetaAnswers, contaRisposte } from "./lead/MetaAnswers";
import { NextActionCard } from "./lead/NextActionCard";
import { poiSeRiesce } from "./lead/salvataggi";
import { Timeline } from "./lead/Timeline";
import { confermaNonPartita, idPerPreventivo, provenienza } from "./scheda";
import { StepperFasi } from "./StepperFasi";
import { callPerFase } from "../../../worker/regole/fasi-call";
import { SezioneCall } from "./SezioneCall";
import { SezioneProposta } from "./SezioneProposta";
import { SezioneSchedaAzienda } from "./SezioneSchedaAzienda";

const PUNTEGGIO = { verde: "Verde", giallo: "Giallo", grigio: "Grigio" } as const;

// Blocco richiudibile della scheda: titolo a sinistra, un riassunto a destra, il contenuto sotto.
function Piega({ titolo, riassunto, aperta = false, children }: { titolo: string; riassunto?: string; aperta?: boolean; children: ReactNode }) {
  return (
    <details open={aperta} className="group rounded-blocco border border-sabbia bg-avorio">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-titolo-card">{titolo}</span>
        {riassunto && <span className="truncate text-secondaria text-grigio tabular-nums">{riassunto}</span>}
        <CaretDown size={18} weight="bold" aria-hidden className="shrink-0 motion-safe:transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-sabbia px-4 py-4">{children}</div>
    </details>
  );
}

// Telefono ed email della scheda si riconoscono come link (voce 41).
// QA Task 15: il link è alto 44 px (bersaglio del telefono), il testo resta sulla sua riga.
const LINK_DATO = "inline-flex min-h-11 items-center break-all font-semibold text-ink underline decoration-sabbia-2 underline-offset-4 hover:decoration-ink";

export function SchedaLeadRotta() {
  const { id = "" } = useParams();
  return <SchedaLead key={id} id={id} />;
}

export function SchedaLead({ id, ora: oraFissa }: { id: string; ora?: number }) {
  const qc = useQueryClient();
  const vai = useNavigate();
  const { key: chiaveStoria } = useLocation();
  const [creaCliente, setCreaCliente] = useState(false);
  const ora = useOra(60_000, oraFissa);
  const fasi = useStages();
  const utenti = useUsers();
  const [foglio, setFoglio] = useState<null | "esito" | "altro" | "fissa" | "whatsapp" | "email" | { fase: Stage }>(null);
  // Le azioni che non si annullano chiedono un secondo tocco sullo stesso pulsante: niente confirm() del browser.
  const [chiede, setChiede] = useState<null | "unisci" | "cestino">(null);
  const [uscito, setUscito] = useState(false);
  // Il modulo dati si rimonta solo dopo un suo salvataggio riuscito: gli altri salvataggi non cancellano quello che si scrive.
  const [versione, setVersione] = useState(0);
  const d = useQuery({ queryKey: ["lead", id], queryFn: () => api<LeadDetail>(`/leads/${id}`), enabled: !uscito });
  const aperta = fasi.data?.find((f) => f.id === d.data?.lead.stageId)?.kind === "open";
  const passo = useQuery({
    queryKey: ["lead", id, "proposta", "non_risponde"],
    queryFn: () => api<Proposta>(`/leads/${id}/proposta?esito=non_risponde`),
    enabled: !!d.data && aperta && !uscito,
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
    onSuccess: () => { esci(); toast.success("Spostato nel cestino"); vai("/commerciale/scaletta"); },
    onError: (e) => toast.error(e.message),
  });
  const unisci = useMutation({
    mutationFn: (intoId: string) => api<{ lead: { id: string } }>(`/leads/${id}/merge`, { method: "POST", json: { intoId } }),
    onSuccess: ({ lead }) => { esci(); toast.success("Lead uniti"); vai(`/commerciale/lead/${lead.id}`); },
    onError: (e) => toast.error(e.message),
  });

  if (d.isLoading) return <div className="mx-auto max-w-[1100px] p-4"><Skeleton righe={8} /></div>;
  if (d.error || !d.data) return <div className="mx-auto max-w-[1100px] p-4"><Errore errore={d.error ?? new Error("Lead non trovato")} onRiprova={() => void d.refetch()} /></div>;
  const { lead, activities, documents, duplicateOf } = d.data;
  const fase = fasi.data?.find((f) => f.id === lead.stageId);
  const responsabile = utenti.data?.find((u) => u.id === lead.ownerId)?.name;
  const soldi = lead.setupCents != null || lead.feeCents != null;
  const seNonRisponde = passo.data?.nextAction ? `${passo.data.nextAction}, ${quando(passo.data.nextActionAt, ora)}` : undefined;
  const chiudi = () => { setFoglio(null); setChiede(null); };

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 p-4 lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex items-start gap-3">
          {/* Voce 41: si torna da dove si è venuti; aperta da un link diretto, la scheda torna alla Scaletta. */}
          <Pulsante variante="icona" aria-label="Torna indietro" title="Torna indietro" className="w-11 shrink-0 px-0!" icona={<ArrowLeft size={22} weight="bold" aria-hidden />}
            onClick={() => (chiaveStoria === "default" ? vai("/commerciale/scaletta") : vai(-1))} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="break-words font-display text-titolo-pagina">{lead.company}</h1>
            {lead.contactName && <p className="text-corpo">{lead.contactName}</p>}
            <p className="text-secondaria text-grigio">{provenienza(lead)}</p>
            {responsabile && <p className="text-secondaria text-grigio">Responsabile: {responsabile}</p>}
            {soldi && <p className="text-secondaria text-grigio tabular-nums">Attesi: setup {euro(lead.setupCents ?? 0)}, canone {euro(lead.feeCents ?? 0)} al mese</p>}
          </div>
          <Pulsante variante="icona" aria-label="Altre azioni" title="Altre azioni" className="w-11 shrink-0 px-0!" icona={<DotsThree size={22} weight="bold" aria-hidden />} onClick={() => setFoglio("altro")} />
        </header>

        {lead.metaStatus && lead.metaStatus !== "ok" && (
          <p className="rounded-blocco border border-sabbia bg-errore-fondo p-4 text-secondaria">I dati del modulo Meta non sono ancora arrivati: riprovo da solo ogni 15 minuti.</p>
        )}

        {confermaNonPartita(lead) && (
          <div role="status" className="flex flex-col gap-1 rounded-blocco border border-sabbia bg-errore-fondo p-4 text-secondaria">
            <p className="font-semibold">Email di conferma non partita</p>
            <p className="text-grigio break-words">{lead.confirmationError ?? "Motivo non registrato"}</p>
          </div>
        )}

        <StepperFasi leadId={lead.id} attuale={lead.stageId} fasi={fasi.data ?? []} senzaAzione={!lead.nextAction || lead.nextActionAt == null}
          onServeFoglio={(f) => setFoglio({ fase: f })} />

        <NextActionCard key={`${lead.nextAction}-${lead.nextActionAt}`} lead={lead} kind={fase?.kind} ora={ora} seNonRisponde={seNonRisponde} onSave={patch.mutate} pending={patch.isPending} />

        <div className="flex flex-col gap-2" role="group" aria-label="Contatta">
          {/* Lead vinto: l'unica azione in accento è aprire il cliente; lead perso: nessuna azione in accento. */}
          {fase?.kind === "won" && d.data.cliente && (
            <Link to={`/commerciale/clienti/${d.data.cliente.id}`} data-variante="primario" className={classiPulsante("primario", "lg")}>Apri cliente</Link>
          )}
          {fase?.kind === "won" && !d.data.cliente && (
            <Pulsante variante="primario" misura="lg" onClick={() => setCreaCliente(true)}>Crea il cliente</Pulsante>
          )}
          <div className="flex">
            <Contatto tipo="chiama" lead={lead} variante={fase && fase.kind !== "open" ? "secondario" : "primario"} misura="lg" onAvvio={() => avviaContatto(lead.id, "chiamata")} />
          </div>
          <div className="flex gap-2">
            <Pulsante variante="icona" misura="lg" aria-label="Scrivi su WhatsApp" title="WhatsApp" className="w-12 shrink-0 px-0!"
              icona={<WhatsappLogo size={20} weight="bold" aria-hidden />} motivoSpento={lead.phone ? undefined : "Manca il telefono"} onClick={() => setFoglio("whatsapp")} />
            <Pulsante variante="icona" misura="lg" aria-label="Scrivi una email" title="Scrivi" className="w-12 shrink-0 px-0!"
              icona={<EnvelopeSimple size={20} weight="bold" aria-hidden />} motivoSpento={lead.email ? undefined : "Manca l'email"} onClick={() => setFoglio("email")} />
            <Pulsante variante="secondario" misura="lg" className="flex-1" onClick={() => setFoglio("esito")}>Segna esito</Pulsante>
          </div>
        </div>

        <dl aria-label="Dati" className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio px-4">
          <Dato etichetta="Telefono">{lead.phone ? <a className={LINK_DATO} href={`tel:${lead.phone}`}>{telefonoMostrato(lead.phone)}</a> : <span className="text-grigio">manca</span>}</Dato>
          <Dato etichetta="Email">{lead.email ? <a className={LINK_DATO} href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="text-grigio">manca</span>}</Dato>
          <Dato etichetta="Fonte">{SOURCE_LABELS[lead.source] ?? lead.source}</Dato>
          {lead.metaCampaign && <Dato etichetta="Campagna">{lead.metaCampaign}</Dato>}
          {lead.setupCents != null && <Dato etichetta="Setup">{euro(lead.setupCents)}</Dato>}
          {lead.feeCents != null && <Dato etichetta="Canone">{euro(lead.feeCents)} al mese</Dato>}
          {responsabile && <Dato etichetta="Responsabile">{responsabile}</Dato>}
          {lead.score && (
            <Dato etichetta="Punteggio"><span className="inline-flex items-center gap-2"><Punto colore={lead.score} etichetta="" />{PUNTEGGIO[lead.score]}</span></Dato>
          )}
        </dl>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div data-sezione="call"><SezioneCall leadId={lead.id} ora={ora} lead={lead} /></div>
        <div data-sezione="proposta"><SezioneProposta leadId={lead.id} /></div>
        <div data-sezione="scheda-azienda"><SezioneSchedaAzienda leadId={lead.id} manuale={lead.source === "manuale"} /></div>

        <Piega titolo="Storico" aperta riassunto={activities[0] ? `ultima voce ${momento(activities[0].createdAt, ora)}` : "nessuna voce"}>
          <Timeline leadId={lead.id} activities={activities} ora={ora} />
        </Piega>
        <Piega titolo="Note e dati" riassunto={lead.notes ? "1 nota" : undefined}>
          <LeadForm key={versione} lead={lead} users={utenti.data ?? []} ora={ora} onSave={poiSeRiesce(patch.mutate, () => setVersione((v) => v + 1))} pending={patch.isPending} />
        </Piega>
        <Piega titolo="Documenti" riassunto={documents.length ? `${documents.length} file` : "nessuno"}>
          <Documents leadId={lead.id} documents={documents} ora={ora} />
        </Piega>
        <Piega titolo="Risposte del modulo" riassunto={contaRisposte(lead) ? `${contaRisposte(lead)} ${contaRisposte(lead) === 1 ? "risposta" : "risposte"}` : "nessuna"}>
          <MetaAnswers lead={lead} />
        </Piega>
        <Piega titolo="Doppioni" aperta={!!duplicateOf} riassunto={duplicateOf ? "1 possibile" : "nessuno"}>
          {duplicateOf ? (
            <div className="flex flex-col gap-3">
              <p className="text-corpo">Sembra un doppione di {duplicateOf.company}.</p>
              <p className="text-secondaria text-grigio">Unendoli, storico e documenti passano di là.</p>
              <Pulsante variante={chiede === "unisci" ? "distruttivo" : "secondario"} className="self-start" inCorso={unisci.isPending}
                onClick={() => (chiede === "unisci" ? unisci.mutate(duplicateOf.id) : setChiede("unisci"))}>
                {chiede === "unisci" ? `Tocca di nuovo per unire in ${duplicateOf.company}` : "Unisci i due lead"}
              </Pulsante>
            </div>
          ) : <p className="text-secondaria text-grigio">Nessun lead con lo stesso telefono o email.</p>}
        </Piega>
      </div>

      {foglio === "esito" && <FoglioEsito lead={lead} onChiudi={chiudi} />}
      {foglio === "fissa" && <FoglioFissaCall leadId={lead.id} haEmail={Boolean(lead.email)} onChiudi={chiudi} />}
      {(foglio === "whatsapp" || foglio === "email") && <FoglioScrivi lead={lead} canale={foglio} onChiudi={chiudi} />}
      {foglio && typeof foglio === "object" && (() => {
        const kind = callPerFase(foglio.fase.id);
        return kind
          ? <FoglioFissaCall leadId={lead.id} haEmail={!!lead.email} fase={{ label: foglio.fase.label, kind }} onChiudi={chiudi} />
          : <FoglioChiusura lead={lead} fase={foglio.fase} onChiudi={chiudi} />;
      })()}
      {creaCliente && <FoglioNuovoCliente daLead={{ id: lead.id, nome: lead.company }} onChiudi={() => { setCreaCliente(false); void d.refetch(); }} />}
      {foglio === "altro" && (
        <Foglio aperto titolo="Altre azioni" onChiudi={chiudi}>
          <ul className="flex flex-col gap-2">
            <li><Riga titolo="Fissa call" secondaria="Conoscenza o presentazione, con l'invito" onClick={() => { setChiede(null); setFoglio("fissa"); }} /></li>
            <li><Riga titolo="Copia l'id per il preventivo" secondaria={idPerPreventivo(lead.id)}
              onClick={() => { void navigator.clipboard.writeText(idPerPreventivo(lead.id)).then(() => toast.success("Copiato: incollalo nel preventivo"), () => toast.error("Non riesco a copiare: seleziona il testo a mano")); chiudi(); }} /></li>
            {duplicateOf && (
              <li><Riga titolo={chiede === "unisci" ? "Tocca di nuovo per unire" : `Unisci in ${duplicateOf.company}`} secondaria={chiede === "unisci" ? "Storico e documenti passano di là" : undefined}
                onClick={() => (chiede === "unisci" ? unisci.mutate(duplicateOf.id) : setChiede("unisci"))} /></li>
            )}
            <li><Riga titolo={chiede === "cestino" ? "Tocca di nuovo: il lead va nel cestino" : "Metti nel cestino"} secondaria={chiede === "cestino" ? "Potrai ripristinarlo da Impostazioni, Cestino" : undefined}
              onClick={() => (chiede === "cestino" ? cestina.mutate() : setChiede("cestino"))} /></li>
          </ul>
        </Foglio>
      )}
    </div>
  );
}
