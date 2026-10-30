import { CaretDown, DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router";
import { Pulsante, Tag, classiPulsante, cx } from "../../../ds";
import type { DocumentRow } from "../../../types";
import { dataTesto } from "../../../../worker/processo/processo";
import { STATI } from "../Proposte";
import { Storico } from "./Documents";
import { fileDi } from "./documentiScheda";
import { Sezione } from "./Sezione";
import { LINK, SECONDARIO } from "./stile";

export type PropostaBreve = { id: string; number: string; status: string };

const giorno = (ms: number) => dataTesto(ms).replace(/^\S+ /, "");

// Blocco "Preventivo" (30/10/2026, contratto di Damiano): subito dopo il Da fare, il file che si apre in trattativa.
// "Apri preventivo" è l'azione del blocco in variante secondaria: il primario della schermata resta nel Da fare.
// Senza preventivo e senza proposta il blocco non c'è; con una proposta e niente file invita a caricarlo.
export function Preventivo({ preventivi, proposta, nuovi = [], ora, inCorso, onCarica, onNuovaVersione }: {
  preventivi: DocumentRow[]; proposta: PropostaBreve | null; nuovi?: string[]; ora: number; inCorso: boolean;
  onCarica: () => void; onNuovaVersione: (d: DocumentRow) => void;
}) {
  const [storico, setStorico] = useState(false);
  const [p, ...altri] = preventivi;
  if (!p && !proposta) return null;
  const rigaProposta = proposta && (
    <Link to={`/commerciale/proposte/${proposta.id}`} className={cx(LINK, "self-start text-testo")}>
      Proposta {proposta.number}, {(STATI[proposta.status as keyof typeof STATI] ?? proposta.status).toLowerCase()}
    </Link>
  );
  if (!p) {
    return (
      <Sezione titolo="Preventivo" nome="preventivo">
        <p className={SECONDARIO}>Nessun file per {proposta!.number}</p>
        <Pulsante variante="secondario" className="self-start" inCorso={inCorso} onClick={onCarica}>Carica il preventivo</Pulsante>
        {rigaProposta}
      </Sezione>
    );
  }
  const versione = p.version ?? 1;
  return (
    <Sezione titolo="Preventivo" nome="preventivo"
      destra={<button type="button" className={cx(LINK, "shrink-0 text-testo")} disabled={inCorso} onClick={() => onNuovaVersione(p)}>{inCorso ? "Carico…" : "Carica nuova versione"}</button>}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-testo font-semibold leading-6" title={p.name}>{p.name}</span>
          {nuovi.includes(p.id) && <Tag>Nuovo</Tag>}
        </span>
        <span className={cx(SECONDARIO, "tabular-nums")}>{[`Versione ${versione}`, giorno(p.updatedAt ?? p.createdAt), p.authorName].filter(Boolean).join(", ")}</span>
      </div>
      {rigaProposta}
      <div className="flex items-center gap-2">
        <a href={fileDi(p.id)} target="_blank" rel="noopener noreferrer" className={cx(classiPulsante("secondario", "md"), "flex-1 sm:flex-none")}>Apri preventivo</a>
        <a href={`${fileDi(p.id)}?scarica=1`} download className={cx(classiPulsante("fantasma", "md"), "shrink-0 px-3")}>
          <DownloadSimple size={18} weight="bold" aria-hidden />Scarica
        </a>
      </div>
      {versione > 1 && (
        <div className="flex flex-col gap-1">
          <button type="button" aria-expanded={storico} onClick={() => setStorico((s) => !s)} className={cx(LINK, "self-start gap-1.5 text-testo")}>
            Versioni precedenti ({versione - 1})
            <CaretDown size={14} weight="bold" aria-hidden className={cx("motion-safe:transition-transform motion-safe:duration-150", storico && "rotate-180")} />
          </button>
          {storico && <Storico id={p.id} ora={ora} />}
        </div>
      )}
      {altri.length > 0 && (
        <div className="flex flex-col border-t border-[#E5DED4] pt-2">
          <span className={SECONDARIO}>Altri preventivi</span>
          {altri.map((a) => (
            <a key={a.id} href={fileDi(a.id)} target="_blank" rel="noopener noreferrer" className={cx(LINK, "text-testo")}>
              {a.name}, {giorno(a.updatedAt ?? a.createdAt)}
            </a>
          ))}
        </div>
      )}
    </Sezione>
  );
}
