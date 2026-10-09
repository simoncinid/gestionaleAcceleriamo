import type { MessageTemplate } from "../../../worker/db/schema";
import { Foglio, Riga, Skeleton } from "../../ds";
import { linkWhatsApp } from "../../format";
import { useModelli } from "../../hooks";
import { avviaContatto } from "./chiamata";
import { compila, modelliDelCanale } from "./modelli";

type LeadScrivi = { id: string; company: string; contactName: string | null; phone: string | null; email: string | null; stageId: string | null };

function apriLink(canale: "whatsapp" | "email", lead: LeadScrivi, testo: string | undefined, oggetto: string | undefined) {
  if (canale === "whatsapp") {
    window.open(linkWhatsApp(lead.phone!, testo), "_blank", "noreferrer");
    return;
  }
  const q = oggetto || testo ? `?subject=${encodeURIComponent(oggetto ?? "")}&body=${encodeURIComponent(testo ?? "")}` : "";
  window.location.href = `mailto:${lead.email}${q}`;
}

// Il gestionale apre WhatsApp o la posta col testo pronto: non sa se il messaggio parte davvero (spec 6.6).
// PV3: si compila solo con compila() e nello storico va sempre l'id del modello.
export function FoglioScrivi({ lead, canale, onChiudi }: { lead: LeadScrivi; canale: "whatsapp" | "email"; onChiudi: () => void }) {
  const modelli = useModelli();
  const elenco = modelliDelCanale(modelli.data, canale, lead.stageId);
  const usa = (m: MessageTemplate | null) => {
    avviaContatto(lead.id, canale, m?.id);
    apriLink(canale, lead, compila(m?.body, lead), compila(m?.subject, lead));
    onChiudi();
  };
  return (
    <Foglio aperto titolo={canale === "whatsapp" ? "Scrivi su WhatsApp" : "Scrivi una email"} onChiudi={onChiudi}>
      {modelli.isLoading ? <Skeleton righe={3} /> : (
        <ul className="flex flex-col gap-2">
          {elenco.map((m) => (
            <li key={m.id}><Riga titolo={m.title} secondaria={compila(m.body, lead)} onClick={() => usa(m)} /></li>
          ))}
          <li><Riga titolo="Senza modello" secondaria={canale === "whatsapp" ? "Apre la chat vuota" : "Apre una email vuota"} onClick={() => usa(null)} /></li>
        </ul>
      )}
    </Foglio>
  );
}
