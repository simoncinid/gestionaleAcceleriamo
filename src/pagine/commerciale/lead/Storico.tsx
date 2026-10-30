import { UploadSimple } from "@phosphor-icons/react";
import { Link } from "react-router";
import { cx } from "../../../ds";
import { partiRoma } from "../../../../worker/lib/roma";
import { EtichettaFase } from "../EtichettaFase";
import { Sezione } from "./Sezione";
import { LINK } from "./stile";
import type { Tappa } from "./storicoTappe";

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
// "12 ott"; l'anno solo se diverso da quello in corso.
export function dataCorta(ms: number, ora: number) {
  const p = partiRoma(ms);
  return `${p.giorno} ${MESI[p.mese - 1]}${p.anno !== partiRoma(ora).anno ? ` ${p.anno}` : ""}`;
}

// Sul telefono i link restano alti 44 px da toccare; sul computer bastano 28 px, così la riga resta compatta.
const LINK_RIGA = cx(LINK, "@xl:min-h-7");
const COLONNE = "@xl:grid @xl:grid-cols-[96px_minmax(0,1fr)_minmax(0,auto)] @xl:items-start @xl:gap-4";

// Storico a tappe (giro 4, contratto di Damiano): data, cosa è successo, documenti. Dal più vecchio al più recente,
// la riga attuale con fondo tinta-2 e barra arancione; i passi già fissati in fondo, in grigio, sotto "In programma".
// Tabella intera, scorre con la pagina. Sotto i 576 px di contenitore ogni riga va in colonna: data, voce, link.
export function Storico({ tappe, ora, fase, onTutte, onCaricaRegistrazione, caricando = false, className }: {
  tappe: Tappa[]; ora: number; fase: { id: string; label: string }; onTutte: () => void;
  onCaricaRegistrazione?: (callId: string) => void; caricando?: boolean; className?: string;
}) {
  const passate = tappe.filter((t) => !t.futura);
  const future = tappe.filter((t) => t.futura);
  const riga = (t: Tappa) => (
    <li key={t.chiave} data-tappa={t.chiave} aria-current={t.attuale ? "step" : undefined}
      className={cx("flex flex-col gap-1 px-3 py-3", COLONNE, t.attuale && "border-l-[3px] border-l-accento bg-tinta-2 pl-[9px]")}>
      <p className={cx("text-nota tabular-nums", t.futura ? "text-grigio-2" : "text-grigio")}>{dataCorta(t.quando, ora)}</p>
      <div className="flex min-w-0 flex-col gap-0.5">
        {t.attuale && (
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-etichetta uppercase text-accento-testo">Adesso</span>
            <EtichettaFase {...fase} />
          </p>
        )}
        <p className={cx("break-words", t.attuale ? "text-voce text-ink" : "text-testo", t.futura ? "text-grigio" : "text-ink")}>{t.testo}</p>
        {t.dettaglio && <p className="text-nota text-grigio">{t.dettaglio}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-start @xl:items-end">
        {t.documenti.map((d) => (
          <a key={d.id} href={d.href} target="_blank" rel="noopener noreferrer" className={cx(LINK_RIGA, "gap-2")}>
            {d.testo}{d.nuovo && <span className="size-2 rounded-full bg-accento" aria-label="nuovo" />}
          </a>
        ))}
        {t.caricaRegistrazione && onCaricaRegistrazione && (
          <button type="button" className={cx(LINK_RIGA, "gap-1.5 font-normal text-grigio")} disabled={caricando} onClick={() => onCaricaRegistrazione(t.caricaRegistrazione!)}>
            <UploadSimple size={18} aria-hidden />{caricando ? "Carico la registrazione" : "Carica la registrazione"}
          </button>
        )}
        {t.link && <Link to={t.link.to} className={cx(LINK_RIGA, "font-normal", t.futura && "text-grigio")}>{t.link.testo}</Link>}
      </div>
    </li>
  );
  return (
    <Sezione titolo="Storico" nome="storico" className={className}
      destra={<button type="button" className={cx(LINK, "text-nota")} onClick={onTutte}>Tutte le attività</button>}>
      <div role="region" aria-label="Storico del lead">
        <div className={cx("hidden border-b border-sabbia px-3 pb-2", "@xl:grid @xl:grid-cols-[96px_minmax(0,1fr)_minmax(0,auto)] @xl:gap-4")} aria-hidden>
          <span className="text-etichetta uppercase text-grigio">Data</span>
          <span className="text-etichetta uppercase text-grigio">Cosa è successo</span>
          <span className="text-right text-etichetta uppercase text-grigio">Documenti</span>
        </div>
        <ol className="flex flex-col divide-y divide-sabbia">{passate.map(riga)}</ol>
        {future.length > 0 && (
          <>
            <p className="border-t border-sabbia px-3 pb-1 pt-3 text-etichetta uppercase text-grigio">In programma</p>
            <ol className="flex flex-col divide-y divide-sabbia">{future.map(riga)}</ol>
          </>
        )}
      </div>
    </Sezione>
  );
}
