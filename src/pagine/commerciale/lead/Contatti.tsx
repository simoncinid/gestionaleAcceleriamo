import { EnvelopeSimple, Phone, WhatsappLogo } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "../../../ds";
import { linkTel, telefonoMostrato } from "../../../format";
import type { Lead } from "../../../types";
import { avviaContatto } from "../chiamata";
import { Sezione } from "./Sezione";
import { ELENCO, LINK, SECONDARIO } from "./stile";

// Pulsante icona dei contatti: riquadro 40 con bordo sabbia, area di tocco 44.
const ICONA = "flex size-11 shrink-0 items-center justify-center rounded-[12px] text-ink";
const RIQUADRO = "flex size-10 items-center justify-center rounded-[12px] border-[1.5px] border-sabbia bg-white hover:bg-crema";

function Icona({ etichetta, href, onClick, children, esterno }: { etichetta: string; href?: string; onClick?: () => void; children: ReactNode; esterno?: boolean }) {
  const dentro = <span className={RIQUADRO}>{children}</span>;
  return href
    ? <a href={href} aria-label={etichetta} title={etichetta} onClick={onClick} className={ICONA} target={esterno ? "_blank" : undefined} rel={esterno ? "noreferrer" : undefined}>{dentro}</a>
    : <button type="button" aria-label={etichetta} title={etichetta} onClick={onClick} className={ICONA}>{dentro}</button>;
}

// Contatti tutti in un posto (giro 2): la persona come voce, poi numero ed email con le loro icone accanto.
// WhatsApp usa lo stesso numero: è un'icona sulla riga del telefono, non una riga sua.
export function Contatti({ lead, onScrivi, onAggiungi }: {
  lead: Pick<Lead, "id" | "contactName" | "phone" | "email">; onScrivi: (canale: "whatsapp" | "email") => void; onAggiungi: () => void;
}) {
  const nome = lead.contactName?.split(" ")[0];
  return (
    <Sezione titolo="Contatti" nome="contatti">
      <ul className={ELENCO}>
        <li className="flex min-h-11 items-center py-2">
          {lead.contactName ? <span className="text-voce">{lead.contactName}</span> : <span className={SECONDARIO}>Persona non indicata</span>}
        </li>
        <li className="flex min-h-[52px] items-center gap-2 py-1">
          {lead.phone
            ? (
              <>
                <a className={cx(LINK, "min-w-0 flex-1 no-underline tabular-nums")} href={`tel:${lead.phone}`}>{telefonoMostrato(lead.phone)}</a>
                <Icona etichetta={nome ? `Chiama ${nome}` : "Chiama"} href={linkTel(lead.phone)} onClick={() => avviaContatto(lead.id, "chiamata")}><Phone size={20} aria-hidden /></Icona>
                <Icona etichetta="Scrivi su WhatsApp" onClick={() => onScrivi("whatsapp")}><WhatsappLogo size={20} aria-hidden /></Icona>
              </>
            )
            : <button type="button" className={LINK} onClick={onAggiungi}>Nessun telefono: aggiungilo</button>}
        </li>
        <li className="flex min-h-[52px] items-center gap-2 py-1">
          {lead.email
            ? (
              <>
                <a className={cx(LINK, "min-w-0 flex-1 truncate no-underline")} href={`mailto:${lead.email}`}><span className="truncate">{lead.email}</span></a>
                <Icona etichetta="Scrivi un'email" onClick={() => onScrivi("email")}><EnvelopeSimple size={20} aria-hidden /></Icona>
              </>
            )
            : <button type="button" className={LINK} onClick={onAggiungi}>Nessuna email: aggiungila</button>}
        </li>
      </ul>
    </Sezione>
  );
}
