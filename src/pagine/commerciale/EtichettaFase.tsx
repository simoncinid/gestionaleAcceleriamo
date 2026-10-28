import { CaretDown } from "@phosphor-icons/react";
import { cx } from "../../ds";
import type { Stage } from "../../types";

// Blocco 1 bis: la fase ha un aspetto solo in tutto il gestionale (tabella, scheda, Oggi, filtro, fogli).
// Etichetta piena e chiara con testo scuro, un colore per famiglia di fase preso dal tono della tabella stages:
// arancione = tocca a noi, blu = c'è una call in calendario, giallo = aspettiamo il cliente, verde = cliente,
// grigio = chiusa. Tinte solide (non trasparenti), così sulla riga a zebra il colore non cambia.
const TINTE: Record<string, string> = {
  orange: "bg-[#FCE4DA] border-[#EFA88E]", // arancione del brand #EC5E2D al 15% su bianco, bordo più scuro
  blue: "bg-[#E1E9F7] border-[#A7BDE3]",
  yellow: "bg-[#FAF0CF] border-[#DFC46F]",
  green: "bg-[#DCF0E3] border-[#98CBA9]",
  neutral: "bg-[#EEEAE4] border-[#D2CABF]",
};
export const tintaFase = (tono: string | null | undefined) => TINTE[tono ?? ""] ?? TINTE.neutral;

// Nome e tono di una fase dall'elenco; se la fase non c'è (dati vecchi) resta l'id in grigio.
export function faseDi(fasi: Stage[] | undefined, id: string): { label: string; tone: string } {
  const f = fasi?.find((x) => x.id === id);
  return { label: f?.label ?? id, tone: f?.tone ?? "neutral" };
}

export function EtichettaFase({ label, tone, freccia = false, className }: { label: string; tone: string; freccia?: boolean; className?: string }) {
  return (
    <span title={label} className={cx("inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-[6px] border px-2 text-[13px] font-medium leading-4 text-ink", tintaFase(tone), className)}>
      <span className="min-w-0 truncate">{label}</span>
      {freccia && <CaretDown size={11} weight="bold" aria-hidden className="shrink-0 opacity-70" />}
    </span>
  );
}
