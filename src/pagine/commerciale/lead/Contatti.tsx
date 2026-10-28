import { Pulsante, classiPulsante } from "../../../ds";
import { linkTel, telefonoMostrato } from "../../../format";
import type { Lead } from "../../../types";
import { avviaContatto } from "../chiamata";
import { Sezione, Voce } from "./Sezione";
import { ELENCO, LINK, SECONDARIO } from "./stile";

// Contatti tutti in un posto: persona, telefono, email, poi tre pulsanti secondari uguali.
// WhatsApp usa lo stesso numero del telefono: non ha una riga sua, ha il pulsante (un dato, un posto).
export function Contatti({ lead, onScrivi, onAggiungi }: {
  lead: Pick<Lead, "id" | "contactName" | "phone" | "email">; onScrivi: (canale: "whatsapp" | "email") => void; onAggiungi: () => void;
}) {
  return (
    <Sezione titolo="Contatti" nome="contatti">
      <dl className={ELENCO}>
        <Voce etichetta="Persona">{lead.contactName ?? <span className={SECONDARIO}>non indicata</span>}</Voce>
        <Voce etichetta="Telefono">
          {lead.phone
            ? <a className={LINK} href={`tel:${lead.phone}`}>{telefonoMostrato(lead.phone)}</a>
            : <button type="button" className={LINK} onClick={onAggiungi}>Nessun telefono: aggiungilo</button>}
        </Voce>
        <Voce etichetta="Email">
          {lead.email
            ? <a className={`${LINK} break-all`} href={`mailto:${lead.email}`}>{lead.email}</a>
            : <button type="button" className={LINK} onClick={onAggiungi}>Nessuna email: aggiungila</button>}
        </Voce>
      </dl>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Contatta">
        {/* Solo testo: tre pulsanti uguali che a 390 stanno interi su una riga. */}
        {lead.phone
          ? <a href={linkTel(lead.phone)} data-variante="secondario" className={`${classiPulsante("secondario", "md")} px-2`} onClick={() => avviaContatto(lead.id, "chiamata")}>Chiama</a>
          : <Pulsante variante="secondario" className="px-2" motivoSpento="Manca il telefono: aggiungilo dai contatti">Chiama</Pulsante>}
        <Pulsante variante="secondario" className="px-2" aria-label="Scrivi su WhatsApp" motivoSpento={lead.phone ? undefined : "Manca il telefono: aggiungilo dai contatti"} onClick={() => onScrivi("whatsapp")}>WhatsApp</Pulsante>
        <Pulsante variante="secondario" className="px-2" aria-label="Scrivi una email" motivoSpento={lead.email ? undefined : "Manca l'email: aggiungila dai contatti"} onClick={() => onScrivi("email")}>Email</Pulsante>
      </div>
    </Sezione>
  );
}
