import { Link } from "react-router";
import { Pulsante, classiPulsante, cx } from "../../../ds";
import { linkTel } from "../../../format";
import type { CodiceAzione, Comando, Lead, Stage } from "../../../types";
import { MOTIVI_PERSI } from "../../../../worker/processo/motivi";
import { dataTesto } from "../../../../worker/processo/processo";
import { avviaContatto } from "../chiamata";
import { FASI_CON_CALL, FASI_TENTATIVI, dataEOra, distanza } from "./daFare";
import { Sezione } from "./Sezione";
import { COLORE_STATO, LINK, SECONDARIO } from "./stile";

// Collegamenti in linea della riga Da fare: la call in programma, l'ultima proposta, il cliente.
export type InLinea = {
  call?: { id: string; scheduledAt: number } | null;
  proposta?: { id: string; number: string } | null;
  cliente?: { id: string; name: string } | null;
};

// Codici in più della scheda: gli stati vuoti dentro Da fare.
export type ComandoScheda = CodiceAzione | "aggiungi_link" | "crea_proposta";

const etichettaMotivo = (codice: string | null | undefined) =>
  codice ? (MOTIVI_PERSI.find((m) => m.id === codice)?.etichetta ?? codice.replace(/_/g, " ")) : null;

// Sezione "Da fare": mostra la riga di prossimaAzione (lead.prossima) e basta. Un solo pulsante primario col testo
// della tabella della sezione 2, al massimo due secondarie a testo, "Poi:" quando il passo dopo è certo.
// I codici che aprono un foglio passano a onComando; chiamare, aprire la videochiamata e il cliente sono link.
export function NextActionCard({ lead, kind, ora, inLinea = {}, onComando }: {
  lead: Lead; kind?: Stage["kind"]; ora: number; inLinea?: InLinea; onComando: (c: ComandoScheda) => void;
}) {
  const p = lead.prossima;
  const chiuso = kind === "won" || kind === "lost" || (p && p.azione == null);
  // "Chiuso il 13 ottobre": senza giorno della settimana, è una data passata.
  const quandoChiuso = dataTesto(lead.stageChangedAt).replace(/^\S+ /, "");

  const primario = (c: Comando) => {
    const classi = cx(classiPulsante("primario", "lg"), "w-full sm:w-auto");
    if (c.codice === "chiama") {
      return lead.phone
        ? <a href={linkTel(lead.phone)} data-variante="primario" className={classi} onClick={() => avviaContatto(lead.id, "chiamata")}>{c.testo}</a>
        : <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto" motivoSpento="Manca il telefono: aggiungilo dai contatti">{c.testo}</Pulsante>;
    }
    if (c.codice === "apri_videochiamata" && lead.meetLink) {
      return <a href={lead.meetLink} target="_blank" rel="noreferrer" data-variante="primario" className={classi}>{c.testo}</a>;
    }
    if (c.codice === "apri_cliente") {
      return inLinea.cliente
        ? <Link to={`/commerciale/clienti/${inLinea.cliente.id}`} data-variante="primario" className={classi}>{c.testo}</Link>
        : <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto" onClick={() => onComando("apri_cliente")}>Crea il cliente</Pulsante>;
    }
    return <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto" onClick={() => onComando(c.codice)}>{c.testo}</Pulsante>;
  };
  const secondaria = (c: Comando) => c.codice === "chiama" && lead.phone
    ? <a key={c.codice} href={linkTel(lead.phone)} data-variante="fantasma" className={classiPulsante("fantasma", "md")} onClick={() => avviaContatto(lead.id, "chiamata")}>{c.testo}</a>
    : <Pulsante key={c.codice} variante="fantasma" onClick={() => onComando(c.codice)}>{c.testo}</Pulsante>;

  // Titolo e righe sotto, per fase.
  let titolo: string;
  const righe: { testo: string; colore?: string }[] = [];
  if (!p) {
    titolo = lead.nextAction ?? "Nessuna azione";
  } else if (chiuso) {
    titolo = kind === "won" || lead.stageId === "chiuso"
      ? `Chiuso come cliente il ${quandoChiuso}`
      : `Chiuso il ${quandoChiuso}${etichettaMotivo(lead.lostReason) ? `: ${etichettaMotivo(lead.lostReason)}` : ""}`;
  } else {
    titolo = p.azione ?? "";
    // "Tentativo n di 5" solo in 10 e 20, e solo se il titolo non lo dice già.
    if (FASI_TENTATIVI.includes(lead.stageId) && p.tentativo != null && !/tentativo/i.test(titolo)) righe.push({ testo: `Tentativo ${p.tentativo} di ${p.massimoTentativi}` });
    if (p.scadenza != null) {
      const call = FASI_CON_CALL.includes(lead.stageId) && !/^(Rifissare|Riprovare)/.test(titolo);
      righe.push({ testo: call ? `${dataEOra(p.scadenza)} ${lead.meetLink ? "su Google Meet" : "al telefono"}` : `Entro ${dataEOra(p.scadenza).toLowerCase()}` });
      if (p.stato) righe.push({ testo: distanza(p.scadenza, p.stato, ora), colore: COLORE_STATO[p.stato] });
    }
  }
  // Senza riga calcolata (risposta vecchia) il lead vinto porta comunque al cliente.
  const pulsante = p?.pulsante ?? (kind === "won" ? { testo: "Apri il cliente", codice: "apri_cliente" as const } : null);
  const secondarie = (p?.secondarie ?? []).slice(0, 2);
  const conCall = FASI_CON_CALL.includes(lead.stageId) && !chiuso;
  const link = [
    inLinea.call && !chiuso ? { to: `/commerciale/call/${inLinea.call.id}`, testo: `Call: ${dataEOra(inLinea.call.scheduledAt)}` } : null,
    inLinea.proposta ? { to: `/commerciale/proposte/${inLinea.proposta.id}`, testo: `Proposta ${inLinea.proposta.number}` } : null,
  ].filter((x): x is { to: string; testo: string } => x != null);

  return (
    <Sezione titolo="Da fare" nome="da-fare">
      <div className="flex flex-col gap-1">
        <p className="text-balance font-sans text-[22px] font-semibold leading-7 tracking-[-0.01em]">{titolo}</p>
        {righe.map((r) => (
          <p key={r.testo} className={cx("text-[15px] leading-6 tabular-nums", r.colore && "text-[13px] font-semibold")} style={r.colore ? { color: r.colore } : undefined}>{r.testo}</p>
        ))}
      </div>
      {(pulsante || secondarie.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-[#E5DED4] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          {pulsante && primario(pulsante)}
          {secondarie.length > 0 && <div className="flex flex-wrap gap-1">{secondarie.map(secondaria)}</div>}
        </div>
      )}
      {/* Stati vuoti dentro Da fare: link della call mancante, proposta mancante in 35 (In attesa offerta). */}
      {conCall && !lead.meetLink && !pulsante?.codice.startsWith("fissa_") && (
        <button type="button" className={`${LINK} self-start`} onClick={() => onComando("aggiungi_link")}>Aggiungi il link della call</button>
      )}
      {lead.stageId === "in-attesa-preventivo" && !inLinea.proposta && (
        <p className="text-[15px]">Nessuna proposta collegata: <button type="button" className={LINK} onClick={() => onComando("crea_proposta")}>Crea la proposta</button></p>
      )}
      {p?.poi && !chiuso && (
        <p className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 border-t border-[#E5DED4] pt-3 text-[15px]">
          <span className={SECONDARIO}>Poi</span><span>{p.poi}</span>
        </p>
      )}
      {link.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 border-t border-[#E5DED4] pt-1">
          {link.map((l) => <li key={l.to}><Link className={LINK} to={l.to}>{l.testo}</Link></li>)}
        </ul>
      )}
    </Sezione>
  );
}
