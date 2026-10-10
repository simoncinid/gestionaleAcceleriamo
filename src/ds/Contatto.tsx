import { EnvelopeSimple, Phone, VideoCamera, WhatsappLogo } from "@phosphor-icons/react";
import { linkTel, linkWhatsApp } from "../format";
import { cx } from "./cx";
import { Pulsante, classiPulsante, type Misura, type Variante } from "./Pulsante";

export type LeadContatto = { contactName?: string | null; phone?: string | null; email?: string | null; meetLink?: string | null };

const ICONE = { chiama: Phone, whatsapp: WhatsappLogo, email: EnvelopeSimple, meet: VideoCamera };

// senzaNome: nelle righe strette il pulsante dice solo "Chiama" (il nome è già scritto sopra), mai "Chiama Ma...".
// intero: il pulsante prende la larghezza del suo testo e non si stringe mai (es. "Apri Meet" accanto a un titolo lungo).
export function Contatto({ tipo, lead, testo, oggetto, variante = "secondario", misura = "md", onAvvio, senzaNome = false, intero = false, className }: {
  tipo: "chiama" | "whatsapp" | "email" | "meet"; lead: LeadContatto; testo?: string; oggetto?: string; variante?: Variante; misura?: Misura; onAvvio?: () => void;
  senzaNome?: boolean; intero?: boolean; className?: string;
}) {
  const nome = senzaNome ? undefined : lead.contactName?.trim().split(/\s+/)[0];
  const Icona = ICONE[tipo];
  const etichetta = tipo === "chiama" ? (nome ? `Chiama ${nome}` : "Chiama") : tipo === "whatsapp" ? "WhatsApp" : tipo === "email" ? "Scrivi" : "Apri Meet";
  const href =
    tipo === "chiama" && lead.phone ? linkTel(lead.phone)
    : tipo === "whatsapp" && lead.phone ? linkWhatsApp(lead.phone, testo)
    : tipo === "email" && lead.email ? `mailto:${lead.email}${oggetto || testo ? `?subject=${encodeURIComponent(oggetto ?? "")}&body=${encodeURIComponent(testo ?? "")}` : ""}`
    : tipo === "meet" && lead.meetLink ? lead.meetLink
    : null;
  if (!href) {
    const motivo = tipo === "email" ? "Manca l'email" : tipo === "meet" ? "Manca il link Meet" : "Manca il telefono";
    return <Pulsante variante={variante} misura={misura} motivoSpento={motivo} aria-label={tipo === "whatsapp" ? "Scrivi su WhatsApp" : undefined} className={cx(intero && "shrink-0", variante === "icona" && "w-11 shrink-0 px-0 md:w-auto md:px-4", className)} icona={<Icona size={20} weight="bold" aria-hidden />}><span className={variante === "icona" ? "sr-only md:not-sr-only" : intero ? undefined : "truncate"}>{etichetta}</span></Pulsante>;
  }
  const esterno = tipo === "meet" || tipo === "whatsapp";
  // Variante a icona: sul telefono solo l'icona in un quadrato da 44 px (il nome resta per lo screen reader), dal desktop anche il nome.
  if (variante === "icona") {
    return (
      <a href={href} aria-label={tipo === "whatsapp" ? "Scrivi su WhatsApp" : undefined} data-variante={variante} onClick={onAvvio} target={esterno ? "_blank" : undefined} rel={esterno ? "noreferrer" : undefined}
        className={cx(classiPulsante(variante, misura), "w-11 shrink-0 px-0 md:w-auto md:px-4", className)}>
        <Icona size={20} weight="bold" aria-hidden className="shrink-0" />
        <span className="sr-only md:not-sr-only">{etichetta}</span>
      </a>
    );
  }
  return (
    <a href={href} aria-label={tipo === "whatsapp" ? "Scrivi su WhatsApp" : undefined} data-variante={variante} onClick={onAvvio} target={esterno ? "_blank" : undefined} rel={esterno ? "noreferrer" : undefined}
      className={cx(classiPulsante(variante, misura), intero ? "shrink-0" : "min-w-0 flex-1", className)}>
      <Icona size={20} weight="bold" aria-hidden className="shrink-0" />
      <span className={intero ? undefined : "truncate"}>{etichetta}</span>
    </a>
  );
}
