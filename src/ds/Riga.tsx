import { Link } from "react-router";
import type { ReactNode } from "react";
import { euro, fermoDa, quando } from "../format";
import { Punto } from "./Segni";

export function Riga({ titolo, secondaria, meta, href, onClick, destra }: { titolo: string; secondaria?: ReactNode; meta?: ReactNode; href?: string; onClick?: () => void; destra?: ReactNode }) {
  const corpo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-corpo font-semibold">{titolo}</p>
        {secondaria && <p className="truncate text-secondaria text-grigio">{secondaria}</p>}
        {meta && <p className="text-meta text-grigio tabular-nums">{meta}</p>}
      </div>
      {destra}
    </>
  );
  const classi = "flex min-h-[60px] items-center gap-3 rounded-blocco bg-avorio px-4 py-3";
  if (href) return <Link to={href} className={`${classi} hover:bg-crema`}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${classi} w-full text-left hover:bg-crema`}>{corpo}</button>;
  return <div className={classi}>{corpo}</div>;
}

export type CardLeadDati = {
  id: string; company: string; contactName?: string | null; nextAction?: string | null; nextActionAt?: number | null;
  stageLabel: string; stageChangedAt: number; score?: "verde" | "giallo" | "grigio" | null; setupCents?: number | null; feeCents?: number | null;
};

// Sei righe in ordine fisso (DS 6.4): azienda, referente, azione, quando, prezzo, fermo.
export function CardLead({ lead, ora = Date.now() }: { lead: CardLeadDati; ora?: number }) {
  const fermo = fermoDa(lead.stageChangedAt, ora);
  const scaduta = lead.nextActionAt != null && lead.nextActionAt < ora;
  return (
    <Link to={`/commerciale/lead/${lead.id}`} className="flex flex-col gap-0.5 rounded-blocco bg-avorio p-4 hover:bg-crema">
      <p className="flex items-center gap-2 text-corpo font-semibold">
        {lead.score && <Punto colore={lead.score} etichetta={`Punteggio ${lead.score}`} />}
        <span className="truncate">{lead.company}</span>
      </p>
      {lead.contactName && <p className="text-secondaria text-grigio">{lead.contactName}</p>}
      {lead.nextAction && <p className="text-secondaria">{lead.nextAction}</p>}
      {lead.nextActionAt != null && <p className={scaduta ? "text-meta font-semibold text-errore tabular-nums" : "text-meta text-grigio tabular-nums"}>{quando(lead.nextActionAt, ora)}</p>}
      {(lead.setupCents != null || lead.feeCents != null) && <p className="text-meta text-grigio tabular-nums">Setup {euro(lead.setupCents ?? 0)}, canone {euro(lead.feeCents ?? 0)}</p>}
      {fermo && <p className="text-meta text-attenzione-testo">{fermo}</p>}
    </Link>
  );
}
