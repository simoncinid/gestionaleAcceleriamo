import { DownloadSimple, FileText, UploadSimple } from "@phosphor-icons/react";
import { AZIONE_CALL } from "../../../../worker/regole/fasi-call";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { euro } from "../../../format";
import { dataTesto } from "../../../../worker/processo/processo";
import { Tag, cx } from "../../../ds";
import type { Collegamenti as Dati, DocumentRow } from "../../../types";
import { fileDi } from "./documentiScheda";
import { STATI as STATI_PROPOSTA } from "../Proposte";
import { dataEOra } from "./daFare";
import { Sezione } from "./Sezione";
import { GRIGIO, LINK, SECONDARIO, VERDE } from "./stile";

const TIPO_CALL = AZIONE_CALL;
const ESITO_CALL = { fatta: "fatta", saltata: "non si è presentato", rimandata: "rimandata" } as const;
const STATO_AUTOMAZIONE: Record<string, string> = { in_costruzione: "in costruzione", attiva: "attiva", in_pausa: "in pausa", dismessa: "dismessa" };
const STATO_CANONE: Record<string, string> = { in_attesa: "in attesa", attivo: "attivo", in_pausa: "in pausa", cessato: "cessato" };

export type AzioneCollegamenti = "proposta" | "call" | "automazione" | "canone";

// Riga di un collegamento: tutta cliccabile, 44 px, testo principale a sinistra e stato a destra.
function Riga({ to, testo, stato }: { to: string; testo: string; stato?: string }) {
  return (
    <li>
      <Link to={to} className="flex min-h-11 items-center justify-between gap-3 py-2 text-testo hover:underline hover:decoration-[#CFC6B9] hover:underline-offset-4">
        <span className="min-w-0 break-words font-semibold">{testo}</span>
        {stato && <span className={`${SECONDARIO} shrink-0`}>{stato}</span>}
      </Link>
    </li>
  );
}

// Gruppo: titolo con il numero, l'azione di creazione a testo a destra del titolo, le righe sotto.
function Gruppo({ titolo, n, azione, children }: { titolo: string; n?: number; azione?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h3 className="text-nota font-semibold uppercase tracking-[0.04em] text-[#6B645C]">
          {titolo}{n != null && n > 0 && <span className="pl-2 tabular-nums">{n}</span>}
        </h3>
        {azione}
      </div>
      <ul className="flex flex-col divide-y divide-[#E5DED4]">{children}</ul>
    </div>
  );
}

// Riga di una call (30/10/2026): il link alla call sopra, sotto le sue registrazioni e trascrizioni.
// Niente link dentro link: la riga non avvolge più tutto. Call fatta senza registrazione: "Carica registrazione".
function RigaCall({ k, testo, stato, documenti, nuovi, caricando, onCarica }: {
  k: { id: string; outcome: string | null }; testo: string; stato: string; documenti: DocumentRow[]; nuovi: string[]; caricando: boolean; onCarica?: () => void;
}) {
  const reg = documenti.filter((d) => d.kind === "registrazione");
  const tra = documenti.filter((d) => d.kind === "trascrizione");
  const azione = "inline-flex min-h-11 items-center gap-1.5 text-testo font-semibold text-ink underline decoration-[#CFC6B9] underline-offset-4 hover:decoration-ink";
  const icona = "shrink-0 text-[#6B645C]";
  const nuovo = (d: DocumentRow) => nuovi.includes(d.id) && <Tag>Nuovo</Tag>;
  const carica = k.outcome === "fatta" && reg.length === 0 && onCarica;
  return (
    <li className="flex flex-col">
      <Link to={`/commerciale/call/${k.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-testo hover:underline hover:decoration-[#CFC6B9] hover:underline-offset-4">
        <span className="min-w-0 break-words font-semibold">{testo}</span>
        <span className={`${SECONDARIO} shrink-0`}>{stato}</span>
      </Link>
      {(documenti.length > 0 || carica) && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-4 pb-2" data-documenti-call={k.id}>
          {reg.map((d, i) => (
            <span key={d.id} className="inline-flex items-center gap-2">
              <a href={`${fileDi(d.id)}?scarica=1`} download className={azione}>
                <DownloadSimple size={18} weight="bold" aria-hidden className={icona} />
                {reg.length > 1 ? `Scarica registrazione ${i + 1}` : "Scarica registrazione"}
              </a>
              {nuovo(d)}
            </span>
          ))}
          {tra.map((d, i) => (
            <span key={d.id} className="inline-flex items-center gap-2">
              <a href={fileDi(d.id)} target="_blank" rel="noopener noreferrer" className={azione}>
                <FileText size={18} weight="bold" aria-hidden className={icona} />
                {tra.length > 1 ? `Leggi trascrizione ${i + 1}` : "Leggi trascrizione"}
              </a>
              {nuovo(d)}
            </span>
          ))}
          {carica && (
            <button type="button" className={cx(azione, "font-normal text-[#6B645C]")} disabled={caricando} onClick={onCarica}>
              <UploadSimple size={18} weight="bold" aria-hidden className={icona} />
              {caricando ? "Carico…" : "Carica registrazione"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

const Vuota = ({ children }: { children: ReactNode }) => <li className={`${SECONDARIO} py-2`}>{children}</li>;

// Sezione "Collegamenti" della scheda (contratto blocco 1, sezione 3, modifica 14): tutto quello che è nato dal lead.
// Automazioni e canoni esistono solo dal cliente: prima c'è una riga grigia che dice quando compaiono.
// Lead perso o scartato (80, 90): niente promessa del cliente, solo che non c'è.
export function Collegamenti({ dati, ora, perso = false, onCrea, documentiCall, nuovi = [], caricando = false, onCaricaRegistrazione }: {
  dati: Dati | undefined; ora: number; perso?: boolean; onCrea: (a: AzioneCollegamenti) => void;
  documentiCall?: Map<string, DocumentRow[]>; nuovi?: string[]; caricando?: boolean; onCaricaRegistrazione?: (callId: string) => void;
}) {
  const crea = (a: AzioneCollegamenti, testo: string) => <button type="button" className={`${LINK} shrink-0 text-testo`} onClick={() => onCrea(a)}>{testo}</button>;
  if (!dati) return <Sezione titolo="Collegamenti" nome="collegamenti"><p className={SECONDARIO}>Carico i collegamenti…</p></Sezione>;
  const { proposte, call, cliente, automazioni, canoni } = dati;
  return (
    <Sezione titolo="Collegamenti" nome="collegamenti">
      <div className="flex flex-col gap-2">
        <Gruppo titolo="Proposte" n={proposte.length} azione={crea("proposta", "Crea una proposta")}>
          {proposte.length === 0 && <Vuota>Nessuna proposta</Vuota>}
          {proposte.map((p) => (
            <Riga key={p.id} to={`/commerciale/proposte/${p.id}`}
              testo={[p.number, p.setupCents != null ? euro(p.setupCents) : null, p.feeCents ? `${euro(p.feeCents)} al mese` : null].filter(Boolean).join(", ")}
              stato={(STATI_PROPOSTA[p.status as keyof typeof STATI_PROPOSTA] ?? p.status).toLowerCase()} />
          ))}
        </Gruppo>
        <Gruppo titolo="Call" n={call.length} azione={crea("call", "Fissa una call")}>
          {call.length === 0 && <Vuota>Nessuna call</Vuota>}
          {call.map((k) => (
            <RigaCall key={k.id} k={k} testo={`${TIPO_CALL[k.kind]}, ${dataEOra(k.scheduledAt).toLowerCase()}`}
              stato={k.outcome ? ESITO_CALL[k.outcome] : k.scheduledAt > ora ? "in programma" : "da segnare"}
              documenti={documentiCall?.get(k.id) ?? []} nuovi={nuovi} caricando={caricando}
              onCarica={onCaricaRegistrazione && (() => onCaricaRegistrazione(k.id))} />
          ))}
        </Gruppo>
        <Gruppo titolo="Cliente">
          {cliente
            ? (
              <li>
                <Link to={`/commerciale/clienti/${cliente.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-testo hover:underline hover:decoration-[#CFC6B9] hover:underline-offset-4">
                  <span className="min-w-0 break-words font-semibold">{cliente.name}</span>
                  <span className="shrink-0 text-nota font-semibold" style={{ color: VERDE }}>Cliente dal {dataTesto(cliente.dal).replace(/^\S+ /, "")}</span>
                </Link>
              </li>
            )
            : <Vuota>{perso ? "Nessun cliente" : "Diventa cliente quando segni il sì: da lì compaiono automazioni e canoni."}</Vuota>}
        </Gruppo>
        {cliente
          ? (
            <>
              <Gruppo titolo="Automazioni" n={automazioni.length} azione={crea("automazione", "Crea un'automazione")}>
                {automazioni.length === 0 && <Vuota>Nessuna automazione</Vuota>}
                {automazioni.map((a) => <Riga key={a.id} to={`/automazioni/${a.id}`} testo={a.name} stato={STATO_AUTOMAZIONE[a.status] ?? a.status} />)}
              </Gruppo>
              <Gruppo titolo="Canoni" n={canoni.length} azione={crea("canone", "Aggiungi un canone")}>
                {canoni.length === 0 && <Vuota>Nessun canone</Vuota>}
                {canoni.map((f) => (
                  <Riga key={f.id} to="/economia/canoni" testo={[`${euro(f.amountCents)} al mese`, f.automationName].filter(Boolean).join(", ")} stato={STATO_CANONE[f.status] ?? f.status} />
                ))}
              </Gruppo>
            </>
          )
          : !perso && (
            <Gruppo titolo="Automazioni e canoni">
              <li className="py-2 text-nota" style={{ color: GRIGIO }}>Compaiono quando è cliente.</li>
            </Gruppo>
          )}
      </div>
    </Sezione>
  );
}
