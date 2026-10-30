import { Link } from "react-router";
import type { ReactNode } from "react";
import { euro, fermoDa, quando } from "../format";
import { Avatar, Punto } from "./Segni";

// peso: il titolo è in semibold; "medio" e "normale" servono agli elenchi letti e non letti (Avvisi).
const PESO = { forte: "font-semibold", medio: "font-medium", normale: "font-normal" } as const;

export function Riga({ titolo, secondaria, meta, href, onClick, destra, peso = "forte" }: { titolo: string; secondaria?: ReactNode; meta?: ReactNode; href?: string; onClick?: () => void; destra?: ReactNode; peso?: keyof typeof PESO }) {
  const corpo = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-testo ${PESO[peso]}`}>{titolo}</p>
        {secondaria && <p className="truncate text-nota text-grigio">{secondaria}</p>}
        {meta && <p className="text-nota text-grigio tabular-nums">{meta}</p>}
      </div>
      {destra}
    </>
  );
  const classi = "flex min-h-[60px] items-center gap-3 rounded-blocco border border-sabbia bg-avorio px-4 py-3";
  if (href) return <Link to={href} className={`${classi} hover:bg-crema`}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${classi} w-full text-left hover:bg-crema`}>{corpo}</button>;
  return <div className={classi}>{corpo}</div>;
}

export type CardLeadDati = {
  id: string; company: string; contactName?: string | null; nextAction?: string | null; nextActionAt?: number | null;
  stageLabel: string; stageChangedAt: number; score?: "verde" | "giallo" | "grigio" | null; setupCents?: number | null; feeCents?: number | null;
};

// Sei righe in ordine fisso (DS 6.4): azienda, referente, azione, quando, prezzo, fermo.
// spazioAzioni: lascia libero l'angolo in alto a destra per il pulsante DotsThree del menu rapido.
// assegnato: chi segue il lead (QA 12 del Piano A), con l'avatar piccolo accanto alla riga "fonte · fase".
export function CardLead({ lead, ora = Date.now(), spazioAzioni = false, fonteFase, azione, assegnato }: {
  lead: CardLeadDati; ora?: number; spazioAzioni?: boolean; fonteFase?: string; azione?: ReactNode; assegnato?: string | null;
}) {
  const fermo = fermoDa(lead.stageChangedAt, ora);
  const scaduta = lead.nextActionAt != null && lead.nextActionAt < ora;
  const corpo = (
    <>
      <p className={spazioAzioni ? "flex items-center gap-2 text-testo font-semibold md:pr-10" : "flex items-center gap-2 text-testo font-semibold"}>
        {lead.score && <Punto colore={lead.score} etichetta={`Punteggio ${lead.score}`} />}
        <span className="truncate">{lead.company}</span>
      </p>
      {lead.contactName && <p className="text-nota text-grigio">{lead.contactName}</p>}
      {(fonteFase || assegnato) && (
        <p className="flex items-center gap-2 text-nota text-grigio">
          {assegnato && <><Avatar nome={assegnato} piccolo /><span className="sr-only">{`Segue ${assegnato}`}</span></>}
          {fonteFase && <span>{fonteFase}</span>}
        </p>
      )}
      {lead.nextAction && <p className="text-nota">{lead.nextAction}</p>}
      {lead.nextActionAt != null && <p className={scaduta ? "text-nota font-semibold text-errore tabular-nums" : "text-nota text-grigio tabular-nums"}>{quando(lead.nextActionAt, ora)}</p>}
      {(lead.setupCents != null || lead.feeCents != null) && <p className="text-nota text-grigio tabular-nums">Setup {euro(lead.setupCents ?? 0)}, canone {euro(lead.feeCents ?? 0)}</p>}
      {fermo && <p className="text-nota text-attenzione-testo">{fermo}</p>}
    </>
  );
  const href = `/commerciale/lead/${lead.id}`;
  // Con un'azione (es. Chiama) il pulsante sta fuori dal link: niente pulsanti dentro un link.
  if (azione) {
    return (
      <div className="flex flex-col gap-3 rounded-blocco border border-sabbia bg-avorio p-4">
        <Link to={href} className="-m-2 flex flex-col gap-0.5 rounded-blocco p-2 hover:bg-crema">{corpo}</Link>
        <div className="flex">{azione}</div>
      </div>
    );
  }
  return <Link to={href} className="flex flex-col gap-0.5 rounded-blocco border border-sabbia bg-avorio p-4 hover:bg-crema">{corpo}</Link>;
}
