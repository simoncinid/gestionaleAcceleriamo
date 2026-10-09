import { EnvelopeSimple, Phone, VideoCamera, WhatsappLogo } from "@phosphor-icons/react";
import { linkTel, linkWhatsApp } from "../format";
import { cx } from "./cx";
import { Pulsante, classiPulsante, type Misura, type Variante } from "./Pulsante";

export type LeadContatto = { contactName?: string | null; phone?: string | null; email?: string | null; meetLink?: string | null };

const ICONE = { chiama: Phone, whatsapp: WhatsappLogo, email: EnvelopeSimple, meet: VideoCamera };

export function Contatto({ tipo, lead, testo, oggetto, variante = "secondario", misura = "md", onAvvio }: {
  tipo: "chiama" | "whatsapp" | "email" | "meet"; lead: LeadContatto; testo?: string; oggetto?: string; variante?: Variante; misura?: Misura; onAvvio?: () => void;
}) {
  const nome = lead.contactName?.trim().split(/\s+/)[0];
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
    return <Pulsante variante={variante} misura={misura} motivoSpento={motivo} aria-label={tipo === "whatsapp" ? "Scrivi su WhatsApp" : undefined} icona={<Icona size={20} weight="bold" aria-hidden />}><span className="truncate">{etichetta}</span></Pulsante>;
  }
  const esterno = tipo === "meet" || tipo === "whatsapp";
  return (
    <a href={href} aria-label={tipo === "whatsapp" ? "Scrivi su WhatsApp" : undefined} data-variante={variante} onClick={onAvvio} target={esterno ? "_blank" : undefined} rel={esterno ? "noreferrer" : undefined}
      className={cx(classiPulsante(variante, misura), "min-w-0 flex-1")}>
      <Icona size={20} weight="bold" aria-hidden className="shrink-0" />
      <span className="truncate">{etichetta}</span>
    </a>
  );
}
