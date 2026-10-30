import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Badge, Punto, Selettore, cx } from "../../../ds";
import { SOURCE_LABELS } from "../../../format";
import type { Lead, User } from "../../../types";
import { dataTesto } from "../../../../worker/processo/processo";
import { leggiRisposte } from "./MetaAnswers";
import { Sezione, Voce } from "./Sezione";
import { ELENCO, LINK } from "./stile";

const PUNTEGGIO = { verde: "Verde", giallo: "Giallo", grigio: "Grigio" } as const;

// Dati del lead (giro 2): in vista solo responsabile, documenti e nota. La fase sta solo nel badge in alto.
// Fonte, campagna, inserzione, arrivo, punteggio e risposte del modulo stanno in "Dettagli", chiusa all'avvio.
export function DatiLead({ lead, utenti, documenti, novita = 0, onResponsabile, onDocumenti, onModifica }: {
  lead: Lead; utenti: Pick<User, "id" | "name">[]; documenti: number; novita?: number;
  onResponsabile: (ownerId: string) => void; onDocumenti: () => void; onModifica: () => void;
}) {
  const [aperti, setAperti] = useState(false);
  const id = useId();
  const risposte = leggiRisposte(lead.metaAnswers);
  const inserzione = [lead.metaAdset, lead.metaAd].filter(Boolean).join(", ");
  const fonte = SOURCE_LABELS[lead.source] ?? lead.source;
  const riassunto = [fonte, lead.score ? PUNTEGGIO[lead.score].toLowerCase() : null].filter(Boolean).join(", ");
  return (
    <Sezione titolo="Dati del lead" nome="dati">
      <Selettore etichetta="Responsabile" valore={lead.ownerId} segnaposto="Nessuno"
        opzioni={utenti.map((u) => ({ valore: u.id, etichetta: u.name }))} onCambia={(id) => id !== lead.ownerId && onResponsabile(id)} />
      <dl className={ELENCO}>
        <Voce etichetta="Documenti">
          <span className="inline-flex items-center gap-2">
            <button type="button" className={documenti ? LINK : `${LINK} font-normal text-grigio`} onClick={onDocumenti}>
              {documenti ? (documenti === 1 ? "1 documento" : `${documenti} documenti`) : "nessuno: carica un file"}
            </button>
            {novita > 0 && <span data-pallino={novita} aria-label={novita === 1 ? "1 novità da vedere" : `${novita} novità da vedere`}><Badge n={novita} /></span>}
          </span>
        </Voce>
        <Voce etichetta="Nota">
          {lead.notes
            ? <span className="whitespace-pre-wrap">{lead.notes}</span>
            : <button type="button" className={LINK} onClick={onModifica}>Scrivi una nota</button>}
        </Voce>
      </dl>
      <div className="flex flex-col border-t border-sabbia">
        <button type="button" aria-expanded={aperti} aria-controls={id} onClick={() => setAperti((x) => !x)}
          className="flex min-h-11 items-center gap-3 pt-2 text-left">
          <span className="text-voce">Dettagli</span>
          <span className="min-w-0 flex-1 truncate text-nota text-grigio">{riassunto}</span>
          <CaretDown size={20} aria-hidden className={cx("shrink-0 text-grigio transition-transform", aperti && "rotate-180")} />
        </button>
        {aperti && (
          <dl id={id} className={ELENCO}>
            {lead.score && <Voce etichetta="Punteggio"><span className="inline-flex items-center gap-2"><Punto colore={lead.score} etichetta="" />{PUNTEGGIO[lead.score]}</span></Voce>}
            <Voce etichetta="Fonte">{fonte}</Voce>
            {lead.metaCampaign && <Voce etichetta="Campagna">{lead.metaCampaign}</Voce>}
            {inserzione && <Voce etichetta="Inserzione">{inserzione}</Voce>}
            <Voce etichetta="Arrivato il">{dataTesto(lead.createdAt)}</Voce>
            {risposte.map(([domanda, risposta]) => <Voce key={domanda} etichetta={domanda}>{risposta}</Voce>)}
          </dl>
        )}
      </div>
    </Sezione>
  );
}
