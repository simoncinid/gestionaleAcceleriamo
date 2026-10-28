import { Link, useNavigate } from "react-router";
import { Pulsante, classiPulsante, cx } from "../../ds";
import { linkTel } from "../../format";
import type { Comando, RigaOggi } from "../../types";
import { avviaContatto } from "./chiamata";
import { classeScadenza } from "./coloriLead";
import { scadenzaBreve } from "./tabellaLead";
import { MenuPunti } from "./Tendina";
import { callDellAssenza, useNonPresentato } from "./nonPresentato";
import { CALL_DEL_CODICE } from "../../../worker/regole/fasi-call";

// Riga di "Da fare oggi" (contratto blocco 1, sezione 5): azione, azienda e persona, scadenza colorata,
// il pulsante dell'azione in linea e il menu "..." con le altre. Solo la prima riga ha il pulsante arancione:
// una sola azione primaria per schermata.

// Cosa fa un comando dalla lista. Quelli che chiedono dati aprono il foglio giusto; quelli che non si fanno
// da qui (spostare una call, la proposta, il cliente, riaprire) portano alla scheda.
// "Non si è presentato" si segna da qui, senza aprire la scheda (modifica 25).
export type Apertura = "esito" | "fissa" | "rimanda";
export function aperturaDi(codice: Comando["codice"]): Apertura | "chiama" | "meet" | "non_presentato" | "scheda" {
  if (codice.startsWith("segna_")) return "esito";
  if (CALL_DEL_CODICE[codice]) return "fissa";
  switch (codice) {
    case "chiama": return "chiama";
    case "apri_videochiamata": return "meet";
    case "non_presentato": return "non_presentato";
    case "rimanda": return "rimanda";
    default: return "scheda";
  }
}

export function RigaDaFare({ l, ora, primaria, onApri }: {
  l: RigaOggi; ora: number; primaria: boolean; onApri: (a: Apertura, c: Comando) => void;
}) {
  const vai = useNavigate();
  const nonPresentato = useNonPresentato();
  const scheda = `/commerciale/lead/${l.id}`;
  const esegui = (c: Comando) => {
    const a = aperturaDi(c.codice);
    if (a === "chiama") { if (l.phone) { avviaContatto(l.id, "chiamata"); window.location.href = linkTel(l.phone); } else vai(scheda); }
    else if (a === "meet") { if (l.meetLink) window.open(l.meetLink, "_blank", "noreferrer"); else vai(scheda); }
    else if (a === "non_presentato") { const kind = callDellAssenza(l.stageId); if (kind) nonPresentato.mutate({ leadId: l.id, kind }); else vai(scheda); }
    else if (a === "scheda") vai(scheda);
    else onApri(a, c);
  };
  const p = l.prossima;
  const pulsante = p.pulsante;
  const persona = [l.company, l.contactName].filter(Boolean).join(", ");
  // Il pulsante della chiamata è un link vero (tel:), così sul telefono parte la chiamata anche senza script.
  const variante = primaria ? "primario" : "secondario";
  const azione = !pulsante ? null
    : pulsante.codice === "chiama" && l.phone
      ? <a href={linkTel(l.phone)} data-variante={variante} onClick={() => avviaContatto(l.id, "chiamata")} title={pulsante.testo} className={cx(classiPulsante(variante, "md"), "w-full min-w-0 md:w-auto")}><span className="truncate">{pulsante.testo}</span></a>
      : <Pulsante variante={variante} title={pulsante.testo} className="w-full min-w-0 md:w-auto" onClick={() => esegui(pulsante)}><span className="truncate">{pulsante.testo}</span></Pulsante>;
  return (
    <li data-lead={l.id} className="relative flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5">{p.azione}</span>
          {p.scadenza != null && <span className={cx("shrink-0 text-[13px] tabular-nums", classeScadenza(p.stato, p.scadenza, ora))}>{scadenzaBreve(p.scadenza, ora, p.stato)}</span>}
        </span>
        <Link to={scheda} className="truncate text-[13px] text-grigio after:absolute after:inset-0 hover:text-ink hover:underline">{persona}</Link>
      </div>
      <div className="relative z-[1] flex items-center gap-2">
        <div className="min-w-0 flex-1 md:flex-none">{azione}</div>
        <MenuPunti etichetta={`Altre azioni per ${l.company}`} voci={[
          ...p.secondarie.filter((c) => c.codice !== pulsante?.codice).map((c) => ({ testo: c.testo, onClick: () => esegui(c) })),
          { testo: "Apri la scheda", onClick: () => vai(scheda) },
        ]} />
      </div>
    </li>
  );
}
