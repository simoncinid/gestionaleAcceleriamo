import { Badge, Punto, Selettore } from "../../../ds";
import { SOURCE_LABELS } from "../../../format";
import type { Lead, Stage, User } from "../../../types";
import { dataTesto } from "../../../../worker/processo/processo";
import { StepperFasi } from "../StepperFasi";
import { leggiRisposte } from "./MetaAnswers";
import { Sezione, Voce } from "./Sezione";
import { ELENCO, LINK, SECONDARIO } from "./stile";

const PUNTEGGIO = { verde: "Verde", giallo: "Giallo", grigio: "Grigio" } as const;

// Dati del lead: fase e responsabile come selettori a espansione, poi un elenco etichetta e valore.
// Ogni dato compare una volta sola nella scheda (fonte, campagna e responsabile stanno solo qui).
export function DatiLead({ lead, fasi, utenti, documenti, novita = 0, onServeFoglio, onResponsabile, onDocumenti, onModifica }: {
  lead: Lead; fasi: Stage[]; utenti: Pick<User, "id" | "name">[]; documenti: number; novita?: number;
  onServeFoglio: (f: Stage) => void; onResponsabile: (ownerId: string) => void; onDocumenti: () => void; onModifica: () => void;
}) {
  const risposte = leggiRisposte(lead.metaAnswers);
  const inserzione = [lead.metaAdset, lead.metaAd].filter(Boolean).join(", ");
  return (
    <Sezione titolo="Dati del lead" nome="dati">
      <div className="flex flex-col gap-2">
        <StepperFasi leadId={lead.id} attuale={lead.stageId} fasi={fasi} onServeFoglio={onServeFoglio} />
        <Selettore etichetta="Responsabile" valore={lead.ownerId} segnaposto="Nessuno"
          opzioni={utenti.map((u) => ({ valore: u.id, etichetta: u.name }))} onCambia={(id) => id !== lead.ownerId && onResponsabile(id)} />
      </div>
      <dl className={ELENCO}>
        {lead.score && <Voce etichetta="Punteggio"><span className="inline-flex items-center gap-2"><Punto colore={lead.score} etichetta="" />{PUNTEGGIO[lead.score]}</span></Voce>}
        <Voce etichetta="Fonte">{SOURCE_LABELS[lead.source] ?? lead.source}</Voce>
        {lead.metaCampaign && <Voce etichetta="Campagna">{lead.metaCampaign}</Voce>}
        {inserzione && <Voce etichetta="Inserzione">{inserzione}</Voce>}
        <Voce etichetta="Arrivato il">{dataTesto(lead.createdAt)}</Voce>
        <Voce etichetta="Documenti">
          <span className="inline-flex items-center gap-2">
            <button type="button" className={documenti ? LINK : `${LINK} font-normal text-[#6B645C]`} onClick={onDocumenti}>
              {documenti ? (documenti === 1 ? "1 documento" : `${documenti} documenti`) : "nessuno: carica un file"}
            </button>
            {novita > 0 && <span data-pallino={novita} aria-label={novita === 1 ? "1 novità da vedere" : `${novita} novità da vedere`}><Badge n={novita} /></span>}
          </span>
        </Voce>
      </dl>
      {risposte.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-[#E5DED4] pt-3">
          <h3 className={`${SECONDARIO} font-sans font-semibold uppercase tracking-[0.06em]`}>Risposte del modulo</h3>
          <dl className={ELENCO}>
            {risposte.map(([domanda, risposta]) => <Voce key={domanda} etichetta={domanda}>{risposta}</Voce>)}
          </dl>
        </div>
      )}
      <div className="flex flex-col gap-1 border-t border-[#E5DED4] pt-3">
        <h3 className={`${SECONDARIO} font-sans font-semibold uppercase tracking-[0.06em]`}>Nota</h3>
        {lead.notes
          ? <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{lead.notes}</p>
          : <button type="button" className={`${LINK} self-start`} onClick={onModifica}>Scrivi una nota</button>}
      </div>
    </Sezione>
  );
}
