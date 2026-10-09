import { Clock, Hourglass } from "@phosphor-icons/react";
import { Link } from "react-router";
import { Contatto, Pulsante, Punto, cx } from "../../ds";
import { euro, quando, testoSla, trascorso } from "../../format";
import { useModelli } from "../../hooks";
import type { PropostaOggi, RigaOggi as Riga } from "../../types";
import { avviaContatto } from "./chiamata";
import { compila, modelloPer } from "./modelli";

const soldi = (setup: number | null, canone: number | null) =>
  setup != null || canone != null ? `Setup ${euro(setup ?? 0)}, canone ${euro(canone ?? 0)}` : null;

export function PulsanteRimanda({ onClick, suAccento = false }: { onClick: () => void; suAccento?: boolean }) {
  return (
    <Pulsante variante="icona" misura={suAccento ? "lg" : "md"} aria-label="Rimanda" title="Rimanda" onClick={onClick}
      className={cx("shrink-0", suAccento ? "w-12 px-0!" : "w-11 px-0!")} icona={<Clock size={20} weight="bold" aria-hidden />} />
  );
}

export function RigaLead({ l, ora, onEsito, onRimanda }: { l: Riga; ora: number; onEsito: () => void; onRimanda: () => void }) {
  const modelli = useModelli().data;
  const wa = modelloPer(modelli, "whatsapp", l.stageId, "non_ti_ho_trovato");
  const mail = modelloPer(modelli, "email", l.stageId, "ti_ho_cercato");
  const scaduta = l.slaScadenza == null && l.nextActionAt != null && l.nextActionAt < ora;
  const slaScaduto = l.slaScadenza != null && l.slaScadenza < ora;
  const prezzo = soldi(l.setupCents, l.feeCents);
  return (
    <li className={cx("flex flex-col gap-3 p-4", scaduta && "bg-tinta-2")}>
      <div className="flex items-start gap-2">
        <Link to={`/commerciale/lead/${l.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-controllo">
          <span className="flex items-center gap-2 text-riga">
            {l.score && <Punto colore={l.score} etichetta={`Punteggio ${l.score}`} />}
            <span>{l.company}</span>
          </span>
          {l.contactName && <span className="truncate text-secondaria text-grigio">{l.contactName}</span>}
          {l.slaScadenza != null ? (
            <>
              <span className="text-secondaria text-grigio">Arrivato {trascorso(l.createdAt, ora)}</span>
              <span className={cx("flex items-center gap-1.5 text-secondaria font-semibold tabular-nums", slaScaduto ? "text-errore" : "text-accento-testo")}>
                <Hourglass size={16} weight="bold" aria-hidden />
                {testoSla(l.slaScadenza, ora)}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-secondaria">
                <Clock size={16} weight="bold" aria-hidden className="shrink-0 text-grigio" />
                <span className="truncate">{l.nextAction ?? "Nessuna azione"}</span>
              </span>
              {l.nextActionAt != null && (
                <span className={cx("text-secondaria tabular-nums", scaduta ? "font-semibold text-errore" : "text-grigio")}>{quando(l.nextActionAt, ora)}</span>
              )}
            </>
          )}
          {prezzo && <span className="text-meta text-grigio tabular-nums">{prezzo}</span>}
        </Link>
        <Pulsante variante="fantasma" className="shrink-0 px-3!" onClick={onEsito}>Esito</Pulsante>
        <PulsanteRimanda onClick={onRimanda} />
      </div>
      <div className="flex items-center gap-2">
        {l.phone ? (
          <>
            <Contatto tipo="chiama" lead={l} variante="icona" onAvvio={() => avviaContatto(l.id, "chiamata")} />
            <Contatto tipo="whatsapp" lead={l} variante="icona" testo={compila(wa?.body, l)} onAvvio={() => avviaContatto(l.id, "whatsapp", wa?.id)} />
          </>
        ) : (
          <Contatto tipo="email" lead={l} variante="icona" oggetto={compila(mail?.subject, l)} testo={compila(mail?.body, l)} onAvvio={() => avviaContatto(l.id, "email", mail?.id)} />
        )}
      </div>
    </li>
  );
}

export function RigaProposta({ p, ora }: { p: PropostaOggi; ora: number }) {
  const fu = modelloPer(useModelli().data, "email", null, "follow_up_preventivo");
  const v = { contactName: p.contactName, company: p.company, numero: p.number };
  const prezzo = soldi(p.setupCents, p.feeCents);
  return (
    <li className="flex flex-col gap-3 p-4">
      <Link to={`/commerciale/lead/${p.leadId}`} className="flex flex-col gap-0.5 rounded-controllo">
        <span className="truncate text-riga">{p.company}</span>
        <span className="text-secondaria text-grigio tabular-nums">Proposta {p.number}</span>
        {prezzo && <span className="text-secondaria text-grigio tabular-nums">{prezzo}</span>}
        {p.nextActionAt != null && <span className="text-secondaria tabular-nums">Ricontatto {quando(p.nextActionAt, ora)}</span>}
      </Link>
      <div className="flex items-center gap-2">
        {p.email ? (
          <Contatto tipo="email" lead={p} variante="icona" oggetto={compila(fu?.subject, v)} testo={compila(fu?.body, v)} onAvvio={() => avviaContatto(p.leadId, "email", fu?.id)} />
        ) : (
          <Contatto tipo="chiama" lead={p} variante="icona" onAvvio={() => avviaContatto(p.leadId, "chiamata")} />
        )}
      </div>
    </li>
  );
}
