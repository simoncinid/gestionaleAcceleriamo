import { CaretDown, Check, DownloadSimple, FileText, NotePencil, Paperclip, Plus, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api } from "../../../api";
import { AreaTesto, Campo, CampoQuando, Pulsante, Skeleton, classiPulsante, cx } from "../../../ds";
import { linkTel } from "../../../format";
import type { CallAgenda, CodiceAzione, Comando, DocumentRow, Lead, Stage, StatoScadenza } from "../../../types";
import { MOTIVI_PERSI } from "../../../../worker/processo/motivi";
import { dataTesto } from "../../../../worker/processo/processo";
import { AZIONE_CALL } from "../../../../worker/regole/fasi-call";
import { avviaContatto } from "../chiamata";
import { leggiNote } from "../note-call";
import { FASI_CON_CALL, FASI_TENTATIVI, dataEOra, orarioBreve, statoDi } from "./daFare";
import { fileDi } from "./documentiScheda";
import { Sezione } from "./Sezione";
import { useTaskDelLead, type TaskLead } from "./taskLead";
import { COLORE_STATO, LINK, SECONDARIO } from "./stile";

// Collegamenti in linea della riga Da fare: la call in programma, l'ultima proposta, il cliente.
export type InLinea = {
  call?: { id: string; scheduledAt: number } | null;
  proposta?: { id: string; number: string } | null;
  cliente?: { id: string; name: string } | null;
};

// Codici in più della scheda: gli stati vuoti dentro Da fare.
export type ComandoScheda = CodiceAzione | "aggiungi_link" | "crea_proposta";
// Cosa si chiede alla scheda su una call precisa: l'esito, spostarla, aggiungere il link.
export type ModoCall = "esito" | "sposta" | "link";


const etichettaMotivo = (codice: string | null | undefined) =>
  codice ? (MOTIVI_PERSI.find((m) => m.id === codice)?.etichetta ?? codice.replace(/_/g, " ")) : null;
const PRIMARIO = cx(classiPulsante("primario", "md"), "w-full sm:w-auto");

// Sezione "Da fare" come lista (giro 2, 30/10/2026). Prima riga: il passo del processo (lead.prossima); se la fase
// ha una call, la riga del passo è la call. Poi le altre call aperte e le cose aggiunte a mano, in ordine di orario.
// Una riga aperta alla volta, la prima all'avvio: il pulsante pieno compare solo nella riga aperta (un primario).
export function NextActionCard({ lead, kind, ora, inLinea = {}, onComando, onCall, documentiTask, nuovi = [], caricando = false, onCaricaTask }: {
  lead: Lead; kind?: Stage["kind"]; ora: number; inLinea?: InLinea; onComando: (c: ComandoScheda) => void;
  onCall?: (k: CallAgenda, modo: ModoCall) => void;
  // Documenti delle cose da fare (stessi documenti del lead, legati alla task): caricamento dentro la task aperta.
  documentiTask?: Map<string, DocumentRow[]>; nuovi?: string[]; caricando?: boolean; onCaricaTask?: (taskId: string, documentId?: string) => void;
}) {
  const qc = useQueryClient();
  const [aperta, setAperta] = useState<string | null>("passo");
  const [conFuoco, setConFuoco] = useState<string | null>(null);
  const [nuova, setNuova] = useState(false);
  // Le cose segnate fatte restano 5 secondi barrate con "Annulla", poi spariscono.
  const [fatte, setFatte] = useState<string[]>([]);
  const timer = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of timer.current.values()) clearTimeout(t); }, []);

  const calls = useQuery({ queryKey: ["lead", lead.id, "calls"], queryFn: () => api<{ calls: CallAgenda[] }>(`/leads/${lead.id}/calls`).then((r) => r.calls) });
  const task = useTaskDelLead(lead.id);
  const rifai = () => void qc.invalidateQueries({ queryKey: ["lead", lead.id, "task"] });
  const fatta = useMutation({
    mutationFn: ({ id, si }: { id: string; si: boolean }) => api(`/tasks/${id}/fatta`, { method: si ? "POST" : "DELETE" }),
    onError: (e, { id }) => { setFatte((f) => f.filter((x) => x !== id)); toast.error(e.message); },
  });
  const segna = (id: string) => {
    setFatte((f) => [...f, id]);
    fatta.mutate({ id, si: true });
    timer.current.set(id, setTimeout(() => { timer.current.delete(id); setFatte((f) => f.filter((x) => x !== id)); rifai(); }, 5000));
  };
  const annulla = (id: string) => {
    clearTimeout(timer.current.get(id));
    timer.current.delete(id);
    setFatte((f) => f.filter((x) => x !== id));
    fatta.mutate({ id, si: false });
  };

  const p = lead.prossima;
  const chiuso = kind === "won" || kind === "lost" || (p && p.azione == null);
  // "Chiuso il 13 ottobre": senza giorno della settimana, è una data passata.
  const quandoChiuso = dataTesto(lead.stageChangedAt).replace(/^\S+ /, "");
  const conCall = FASI_CON_CALL.includes(lead.stageId) && !chiuso;
  // Stessa chiave di Assistente e SezioneCall: la cache tiene l'elenco delle call.
  const tutteCall = calls.data ?? [];
  // La call del passo: quella in programma della scheda, con note e link quando la lista delle call è arrivata.
  const callPasso = conCall && inLinea.call ? (tutteCall.find((k) => k.id === inLinea.call?.id) ?? null) : null;

  const primario = (c: Comando) => {
    if (c.codice === "chiama") {
      return lead.phone
        ? <a href={linkTel(lead.phone)} data-variante="primario" className={PRIMARIO} onClick={() => avviaContatto(lead.id, "chiamata")}>{c.testo}</a>
        : <Pulsante variante="primario" className="w-full sm:w-auto" motivoSpento="Manca il telefono: aggiungilo dai contatti">{c.testo}</Pulsante>;
    }
    if (c.codice === "apri_videochiamata" && lead.meetLink) {
      return <a href={lead.meetLink} target="_blank" rel="noreferrer" data-variante="primario" className={PRIMARIO}>{c.testo}</a>;
    }
    if (c.codice === "apri_cliente") {
      return inLinea.cliente
        ? <Link to={`/commerciale/clienti/${inLinea.cliente.id}`} data-variante="primario" className={PRIMARIO}>{c.testo}</Link>
        : <Pulsante variante="primario" className="w-full sm:w-auto" onClick={() => onComando("apri_cliente")}>Crea il cliente</Pulsante>;
    }
    return <Pulsante variante="primario" className="w-full sm:w-auto" onClick={() => onComando(c.codice)}>{c.testo}</Pulsante>;
  };
  const secondaria = (c: Comando) => c.codice === "chiama" && lead.phone
    ? <a key={c.codice} href={linkTel(lead.phone)} data-variante="fantasma" className={classiPulsante("fantasma", "md")} onClick={() => avviaContatto(lead.id, "chiamata")}>{c.testo}</a>
    : <Pulsante key={c.codice} variante="fantasma" onClick={() => onComando(c.codice)}>{c.testo}</Pulsante>;

  // Riga del passo: titolo, nota sotto (tentativo, canale), orario a destra.
  let titolo: string;
  const nota: string[] = [];
  if (!p) {
    titolo = lead.nextAction ?? "";
  } else if (chiuso) {
    titolo = kind === "won" || lead.stageId === "chiuso"
      ? `Chiuso come cliente il ${quandoChiuso}`
      : `Chiuso il ${quandoChiuso}${etichettaMotivo(lead.lostReason) ? `: ${etichettaMotivo(lead.lostReason)}` : ""}`;
  } else {
    titolo = p.azione ?? "";
    // "Tentativo n di 5" solo in 10 e 20, e solo se il titolo non lo dice già.
    if (FASI_TENTATIVI.includes(lead.stageId) && p.tentativo != null && !/tentativo/i.test(titolo)) nota.push(`Tentativo ${p.tentativo} di ${p.massimoTentativi}`);
    if (p.scadenza != null && conCall && !/^(Rifissare|Riprovare)/.test(titolo)) nota.push(lead.meetLink ? "su Google Meet" : "al telefono");
  }
  // Senza riga calcolata (risposta vecchia) il lead vinto porta comunque al cliente.
  const pulsante = p?.pulsante ?? (kind === "won" ? { testo: "Apri il cliente", codice: "apri_cliente" as const } : null);
  const secondarie = (p?.secondarie ?? []).slice(0, 2);
  // La spunta del passo apre il foglio dell'esito: il codice "segna_" della riga, se no quello generico.
  const codiceSegna = [pulsante, ...secondarie].find((c) => c?.codice.startsWith("segna_"))?.codice ?? "segna_esito";
  const haPasso = Boolean(titolo) || pulsante != null;

  const dettagliPasso = (
    <>
      {/* Call: canale e giorno, come nella riga di una call. Altri passi: la scadenza sta solo a destra sulla riga (Tommaso, 30/10). */}
      {p?.scadenza != null && p.stato && !chiuso && conCall && (
        <p className="text-testo tabular-nums">{lead.meetLink ? "Google Meet" : "Al telefono"}, {dataEOra(p.scadenza).toLowerCase()}</p>)}
      {p?.poi && !chiuso && <p className="text-testo"><span className={SECONDARIO}>Poi: </span>{p.poi}</p>}
      {(pulsante || secondarie.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {pulsante && primario(pulsante)}
          {secondarie.length > 0 && <div className="flex flex-wrap gap-1">{secondarie.map(secondaria)}</div>}
        </div>
      )}
      {/* Stati vuoti dentro Da fare: link della call mancante, proposta mancante in 35 (In attesa offerta). */}
      {conCall && !lead.meetLink && !pulsante?.codice.startsWith("fissa_") && (
        <button type="button" className={`${LINK} self-start`} onClick={() => onComando("aggiungi_link")}>Aggiungi il link della call</button>
      )}
      {lead.stageId === "in-attesa-preventivo" && !inLinea.proposta && (
        <p className="text-testo">Nessuna proposta collegata: <button type="button" className={LINK} onClick={() => onComando("crea_proposta")}>Crea la proposta</button></p>
      )}
      {((inLinea.call && !chiuso) || inLinea.proposta) && (
        <ul className="flex flex-wrap gap-x-5">
          {inLinea.call && !chiuso && <li><Link className={LINK} to={`/commerciale/call/${inLinea.call.id}`}>Apri la call</Link></li>}
          {inLinea.proposta && <li><Link className={LINK} to={`/commerciale/proposte/${inLinea.proposta.id}`}>Proposta {inLinea.proposta.number}</Link></li>}
        </ul>
      )}
      {!chiuso && (callPasso
        ? <NotaCall k={callPasso} leadId={lead.id} fuoco={conFuoco === "passo"} />
        : <NotaStorico leadId={lead.id} fuoco={conFuoco === "passo"} />)}
    </>
  );

  // Le altre call ancora da fare e le cose a mano, in ordine di orario (senza orario in fondo).
  const altreCall = tutteCall.filter((k) => k.outcome == null && k.id !== (conCall ? inLinea.call?.id : undefined));
  const cose = (task.data?.task ?? []).filter((t) => t.doneAt == null || fatte.includes(t.id));
  const altre = [
    ...altreCall.map((k) => ({ chiave: `call-${k.id}`, quando: k.scheduledAt, call: k, cosa: null })),
    ...cose.map((t) => ({ chiave: `task-${t.id}`, quando: t.dueAt, call: null, cosa: t })),
  ].sort((a, b) => (a.quando ?? Infinity) - (b.quando ?? Infinity));
  const apri = (chiave: string, fuoco = false) => { setNuova(false); setConFuoco(fuoco ? chiave : null); setAperta((x) => (x === chiave && !fuoco ? null : chiave)); };
  const vuota = !haPasso && altre.length === 0 && !task.isLoading;

  return (
    <Sezione titolo="Da fare" nome="da-fare">
      {vuota && <p className="text-testo text-grigio">Niente da fare su questo lead.</p>}
      <ul className="flex flex-col divide-y divide-sabbia">
        {haPasso && (
          <RigaDaFare titolo={titolo} nota={nota.join(", ")} aperta={aperta === "passo"} onApri={(f) => apri("passo", f)}
            orario={p?.scadenza != null && !chiuso ? orarioBreve(p.scadenza, ora) : null} stato={p?.stato ?? null}
            spunta={chiuso ? null : { etichetta: "Segna com'è andata", onClick: () => onComando(codiceSegna) }} conNota={!chiuso}>
            {dettagliPasso}
          </RigaDaFare>
        )}
        {altre.map(({ chiave, call: k, cosa: t }) => k ? (
          <RigaDaFare key={chiave} titolo={AZIONE_CALL[k.kind]} nota={k.meetLink ? "su Google Meet" : "al telefono"} aperta={aperta === chiave} onApri={(f) => apri(chiave, f)}
            orario={orarioBreve(k.scheduledAt, ora)} stato={statoDi(k.scheduledAt, ora)} conNota
            spunta={{ etichetta: "Segna com'è andata", onClick: () => onCall?.(k, "esito") }}>
            <p className="text-testo">{k.meetLink ? "Google Meet" : "Al telefono"}, {dataEOra(k.scheduledAt).toLowerCase()}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {k.meetLink
                ? <a href={k.meetLink} target="_blank" rel="noreferrer" data-variante="primario" className={PRIMARIO}>Apri la videochiamata</a>
                : <Pulsante variante="primario" className="w-full sm:w-auto" onClick={() => onCall?.(k, "link")}>Aggiungi il link</Pulsante>}
              <Pulsante variante="fantasma" onClick={() => onCall?.(k, "sposta")}>Sposta</Pulsante>
              <Link className={LINK} to={`/commerciale/call/${k.id}`}>Apri la call</Link>
            </div>
            <NotaCall k={k} leadId={lead.id} fuoco={conFuoco === chiave} />
          </RigaDaFare>
        ) : t ? (
          <RigaDaFare key={chiave} titolo={t.title} nota={t.note ?? ""} aperta={aperta === chiave} onApri={(f) => apri(chiave, f)}
            orario={t.dueAt != null ? orarioBreve(t.dueAt, ora) : null} stato={t.dueAt != null ? statoDi(t.dueAt, ora) : null} conNota
            fatta={fatte.includes(t.id)} onAnnulla={() => annulla(t.id)} documenti={documentiTask?.get(t.id)} nuovi={nuovi}
            spunta={{ etichetta: `Segna fatta: ${t.title}`, onClick: () => !fatte.includes(t.id) && segna(t.id) }}>
            <DocumentiCosa documenti={documentiTask?.get(t.id) ?? []} nuovi={nuovi} caricando={caricando}
              onCarica={onCaricaTask && ((doc) => onCaricaTask(t.id, doc))} />
            <DettagliCosa t={t} ora={ora} fuoco={conFuoco === chiave} onFatto={() => { setAperta(null); rifai(); }} />
          </RigaDaFare>
        ) : null)}
      </ul>
      {(task.isLoading || calls.isLoading) && <Skeleton righe={1} />}
      {(task.error || calls.error) && (
        <p role="alert" className="flex flex-wrap items-center gap-x-3 text-testo">
          Non riesco a caricare il Da fare
          <button type="button" className={LINK} onClick={() => { void task.refetch(); void calls.refetch(); }}>Riprova</button>
        </p>
      )}
      {nuova
        ? <NuovaCosa leadId={lead.id} ora={ora} onFine={() => { setNuova(false); rifai(); }} />
        : (
          <button type="button" className={`${LINK} gap-2 self-start no-underline`} onClick={() => { setAperta(null); setNuova(true); }}>
            <Plus size={20} weight="bold" aria-hidden />Aggiungi una cosa da fare
          </button>
        )}
    </Sezione>
  );
}

// Una riga della lista: spunta, voce con una riga di nota, orario a destra, icona nota, freccia.
// Tutta la riga apre i dettagli, tranne la spunta e l'icona della nota.
function RigaDaFare({ titolo, nota, orario, stato, aperta, onApri, spunta, conNota, fatta = false, onAnnulla, documenti = [], nuovi = [], children }: {
  titolo: string; nota: string; orario: string | null; stato: StatoScadenza | null; aperta: boolean; onApri: (fuoco?: boolean) => void;
  spunta: { etichetta: string; onClick: () => void } | null; conNota?: boolean; fatta?: boolean; onAnnulla?: () => void;
  documenti?: DocumentRow[]; nuovi?: string[]; children: ReactNode;
}) {
  // Il file sulla riga: una piccola graffetta che lo apre (il più recente se sono più d'uno), col pallino se è nuovo.
  const primo = documenti[0];
  const novita = documenti.some((d) => nuovi.includes(d.id));
  const id = useId();
  return (
    <li className="flex flex-col">
      <div className="flex min-h-[60px] items-center">
        {spunta
          ? (
            <button type="button" aria-label={spunta.etichetta} onClick={spunta.onClick} className="group flex size-11 shrink-0 items-center justify-center">
              <span className={cx("flex size-5 items-center justify-center rounded-full border-[1.5px]",
                fatta ? "border-successo bg-successo text-white" : "border-grigio-2 group-hover:border-ink")}>
                {fatta && <Check size={12} weight="bold" aria-hidden />}
              </span>
            </button>
          )
          : <span className="size-11 shrink-0" aria-hidden />}
        <button type="button" aria-expanded={aperta} aria-controls={id} onClick={() => onApri()} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cx("line-clamp-2 text-voce", fatta ? "text-grigio line-through" : "text-ink")}>{titolo}</span>
            {nota && <span className="truncate text-nota text-grigio">{nota}</span>}
          </span>
          {orario && !fatta && (
            <span className="min-w-[88px] shrink-0 text-right text-nota font-semibold tabular-nums" style={stato ? { color: COLORE_STATO[stato] } : undefined}>{orario}</span>
          )}
        </button>
        {primo && !fatta && (
          <a href={fileDi(primo.id)} target="_blank" rel="noopener noreferrer" title={primo.name}
            aria-label={documenti.length === 1 ? `Apri il documento ${primo.name}${novita ? ", nuovo" : ""}` : `Apri il documento ${primo.name}, ${documenti.length} in tutto${novita ? ", con novità" : ""}`}
            className="relative flex size-11 shrink-0 items-center justify-center text-grigio hover:text-ink">
            <Paperclip size={20} aria-hidden />
            {novita && <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accento" />}
          </a>
        )}
        {fatta && onAnnulla && <button type="button" className={`${LINK} px-2`} onClick={onAnnulla}>Annulla</button>}
        {conNota && !fatta && (
          <button type="button" aria-label={`Scrivi una nota: ${titolo}`} onClick={() => onApri(true)} className="flex size-11 shrink-0 items-center justify-center text-grigio hover:text-ink">
            <NotePencil size={20} aria-hidden />
          </button>
        )}
        <span aria-hidden onClick={() => onApri()} className="hidden size-11 shrink-0 cursor-pointer items-center justify-center text-grigio sm:flex">
          <CaretDown size={20} className={cx("transition-transform", aperta && "rotate-180")} />
        </span>
      </div>
      {aperta && <div id={id} className="flex flex-col gap-3 pb-4 pl-14">{children}</div>}
    </li>
  );
}

// Note della call: il campo "Altro" delle note (le altre voci restano nella scheda della call).
function NotaCall({ k, leadId, fuoco }: { k: CallAgenda; leadId: string; fuoco: boolean }) {
  const qc = useQueryClient();
  const [testo, setTesto] = useState(() => leggiNote(k.notes).libero ?? "");
  const salva = useMutation({
    mutationFn: () => api(`/calls/${k.id}`, { method: "PATCH", json: { notes: JSON.stringify({ ...leggiNote(k.notes), libero: testo.trim() }) } }),
    onSuccess: () => { toast.success("Nota salvata"); for (const c of [["lead", leadId], ["calls"]]) void qc.invalidateQueries({ queryKey: c }); },
    onError: (e) => toast.error(e.message),
  });
  const cambiata = testo.trim() !== (leggiNote(k.notes).libero ?? "").trim();
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (cambiata) salva.mutate(); }}>
      <AreaTesto etichetta="Note della call" value={testo} onChange={(e) => setTesto(e.target.value)} autoFocus={fuoco} cresce rows={2} />
      {cambiata && <Pulsante variante="secondario" type="submit" className="self-start" inCorso={salva.isPending}>Salva la nota</Pulsante>}
    </form>
  );
}

// Un'informazione in più sul passo senza call: va nello Storico come nota.
function NotaStorico({ leadId, fuoco }: { leadId: string; fuoco: boolean }) {
  const qc = useQueryClient();
  const [testo, setTesto] = useState("");
  const salva = useMutation({
    mutationFn: () => api(`/leads/${leadId}/activities`, { method: "POST", json: { type: "nota", body: testo.trim() } }),
    onSuccess: () => { toast.success("Nota aggiunta allo storico"); setTesto(""); void qc.invalidateQueries({ queryKey: ["lead", leadId] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (testo.trim()) salva.mutate(); }}>
      <AreaTesto etichetta="Aggiungi un'informazione" value={testo} onChange={(e) => setTesto(e.target.value)} autoFocus={fuoco} cresce rows={2} />
      {testo.trim() && <Pulsante variante="secondario" type="submit" className="self-start" inCorso={salva.isPending}>Salva nello storico</Pulsante>}
    </form>
  );
}

// Documenti della cosa da fare, dentro la riga aperta: apri, scarica, nuova versione; "Carica un documento" se non c'è.
function DocumentiCosa({ documenti, nuovi, caricando, onCarica }: {
  documenti: DocumentRow[]; nuovi: string[]; caricando: boolean; onCarica?: (documentId?: string) => void;
}) {
  const azione = "inline-flex min-h-11 items-center gap-1.5 text-nota font-semibold text-ink underline decoration-sabbia-2 underline-offset-4 hover:decoration-ink";
  return (
    <div className="flex flex-col gap-1">
      {documenti.map((d) => (
        <div key={d.id} className="flex flex-col">
          <p className="flex items-center gap-2 text-testo">
            <span className="min-w-0 truncate">{d.name}</span>
            {nuovi.includes(d.id) && <span className="shrink-0 rounded-full bg-tinta px-2 text-etichetta text-accento-testo">Nuovo</span>}
          </p>
          <p className={SECONDARIO}>Versione {d.version ?? 1}{d.authorName ? `, ${d.authorName}` : ""}</p>
          <div className="flex flex-wrap gap-x-4">
            <a href={fileDi(d.id)} target="_blank" rel="noopener noreferrer" className={azione}><FileText size={18} aria-hidden />Apri</a>
            <a href={`${fileDi(d.id)}?scarica=1`} download className={azione}><DownloadSimple size={18} aria-hidden />Scarica</a>
            {onCarica && <button type="button" className={azione} disabled={caricando} onClick={() => onCarica(d.id)}><UploadSimple size={18} aria-hidden />Nuova versione</button>}
          </div>
        </div>
      ))}
      {onCarica && (
        <button type="button" className={`${azione} self-start`} disabled={caricando} onClick={() => onCarica()}>
          <UploadSimple size={18} aria-hidden />{caricando ? "Carico il documento" : documenti.length ? "Carica un altro documento" : "Carica un documento"}
        </button>
      )}
    </div>
  );
}

// Cosa aggiunta a mano, aperta: nota e data modificabili, "Elimina" grigio. Nessun pulsante pieno.
function DettagliCosa({ t, ora, fuoco, onFatto }: { t: TaskLead; ora: number; fuoco: boolean; onFatto: () => void }) {
  const [nota, setNota] = useState(t.note ?? "");
  const [quando, setQuando] = useState<number | null>(t.dueAt);
  const salva = useMutation({
    mutationFn: () => api(`/tasks/${t.id}`, { method: "PATCH", json: { note: nota.trim() || null, dueAt: quando } }),
    onSuccess: () => { toast.success("Salvato"); onFatto(); },
    onError: (e) => toast.error(e.message),
  });
  const elimina = useMutation({
    mutationFn: () => api(`/tasks/${t.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Eliminata"); onFatto(); },
    onError: (e) => toast.error(e.message),
  });
  const cambiata = nota.trim() !== (t.note ?? "").trim() || quando !== t.dueAt;
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (cambiata) salva.mutate(); }}>
      <AreaTesto etichetta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} autoFocus={fuoco} cresce rows={2} />
      <CampoQuando etichetta="Quando" valore={quando} onCambia={setQuando} ora={ora} />
      <div className="flex flex-wrap items-center gap-2">
        {cambiata && <Pulsante variante="secondario" type="submit" inCorso={salva.isPending}>Salva</Pulsante>}
        <Pulsante variante="fantasma" type="button" className="text-grigio!" inCorso={elimina.isPending} onClick={() => elimina.mutate()}>Elimina</Pulsante>
      </div>
    </form>
  );
}

// "Aggiungi una cosa da fare": si apre in riga, titolo, quando e nota.
function NuovaCosa({ leadId, ora, onFine }: { leadId: string; ora: number; onFine: () => void }) {
  const [titolo, setTitolo] = useState("");
  const [quando, setQuando] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const crea = useMutation({
    mutationFn: () => api("/tasks", { method: "POST", json: { title: titolo.trim(), leadId, dueAt: quando, note: nota.trim() || null } }),
    onSuccess: () => { toast.success("Aggiunta al Da fare"); onFine(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <form className="flex flex-col gap-3 border-t border-sabbia pt-3" onSubmit={(e) => { e.preventDefault(); if (titolo.trim()) crea.mutate(); }}>
      <Campo etichetta="Cosa c'è da fare" value={titolo} onChange={(e) => setTitolo(e.target.value)} autoFocus maxLength={200} />
      <CampoQuando etichetta="Quando" valore={quando} onCambia={setQuando} ora={ora} />
      <AreaTesto etichetta="Nota" value={nota} onChange={(e) => setNota(e.target.value)} cresce rows={2} />
      <div className="flex flex-wrap items-center gap-2">
        <Pulsante variante="secondario" type="submit" inCorso={crea.isPending} motivoSpento={titolo.trim() ? undefined : "Scrivi cosa c'è da fare"}>Aggiungi</Pulsante>
        <Pulsante variante="fantasma" type="button" onClick={onFine}>Annulla</Pulsante>
      </div>
    </form>
  );
}
