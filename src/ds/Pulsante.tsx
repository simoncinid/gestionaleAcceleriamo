import { CircleNotch } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { toast } from "sonner";
import { cx } from "./cx";

export type Variante = "primario" | "su-accento" | "secondario" | "fantasma" | "distruttivo" | "icona";
export type Misura = "lg" | "md" | "sm";

// Una sola funzione di classi: la usano Pulsante e Contatto (che è un link).
export function classiPulsante(variante: Variante, misura: Misura) {
  return cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-controllo text-corpo font-semibold transition-[background-color,transform] duration-(--durata-veloce) ease-uscita active:translate-y-px",
    "disabled:bg-sabbia disabled:text-grigio disabled:border-0 disabled:active:translate-y-0 aria-disabled:bg-sabbia aria-disabled:text-grigio aria-disabled:border-0",
    misura === "lg" ? "h-12 px-5" : misura === "md" ? "h-11 px-4" : "h-10 w-10 p-0",
    variante === "primario" && "bg-accento text-accento-inchiostro hover:bg-accento-premuto focus-visible:outline-accento-inchiostro",
    variante === "su-accento" && "bg-avorio text-ink hover:bg-crema",
    variante === "secondario" && "border-[1.5px] border-ink text-ink hover:bg-crema active:bg-sabbia",
    variante === "fantasma" && "text-ink hover:bg-crema active:bg-sabbia",
    variante === "distruttivo" && "border-[1.5px] border-errore text-errore hover:bg-errore-fondo",
    variante === "icona" && "border-[1.5px] border-ink text-ink hover:bg-crema active:bg-sabbia",
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; misura?: Misura; inCorso?: boolean; icona?: ReactNode; motivoSpento?: string };

export function Pulsante({ variante = "secondario", misura = "md", inCorso, icona, motivoSpento, children, className, onClick, type = "button", ...p }: Props) {
  return (
    <button
      {...p}
      type={type}
      data-variante={variante}
      aria-busy={inCorso || undefined}
      aria-disabled={motivoSpento ? true : undefined}
      disabled={p.disabled || inCorso}
      onClick={(e) => (motivoSpento ? toast(motivoSpento) : onClick?.(e))}
      className={cx(classiPulsante(variante, misura), className)}
    >
      {inCorso ? <CircleNotch size={20} weight="bold" className="spinner animate-spin" aria-hidden /> : icona}
      {children}
    </button>
  );
}
