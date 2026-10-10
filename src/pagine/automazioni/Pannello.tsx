import { Link } from "react-router";
import { descrizioneAnonima, ETICHETTE_AUTOMAZIONE } from "../../../worker/economia/calcoli";
import { Errore, Interruttore, Intestazione, LogoCliente, Punto, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro } from "../../format";
import { useOra } from "../../hooks";
import type { AutomazioneRiga } from "../../types";
import { useAutomazioni } from "../dati-gestione";
import { setAnonimo, useAnonimo } from "./anonimo";

// Soprattitolo delle due pagine di Automazioni: il giorno, sul fuso di Roma.
const GIORNO_LUNGO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
export const oggiLungo = (ora: number) => GIORNO_LUNGO.format(ora);

export const nomeCliente = (a: AutomazioneRiga, anonimo: boolean) => (anonimo ? descrizioneAnonima(a.settore, a.citta) : a.cliente);

const COLORE_STATO = { attiva: "verde", in_costruzione: "giallo", in_pausa: "grigio", dismessa: "grigio" } as const;

// Titolo: cosa fa, in parole semplici. Poi il cliente (logo e nome, link alla sua scheda), lo stato, i passaggi e il costo vivo.
// Con i nomi nascosti restano solo settore e città, senza logo. La card è un link alla scheda: il cliente è un secondo link accanto, mai dentro.
function CardAutomazione({ a, anonimo }: { a: AutomazioneRiga; anonimo: boolean }) {
  const passaggi = a.passaggi ?? 0;
  return (
    <div className="relative grid h-full gap-2 rounded-blocco border border-sabbia bg-avorio p-5 hover:bg-crema">
      <Link to={`/automazioni/${a.id}`} className="font-display text-titolo-card after:absolute after:inset-0">{a.name}</Link>
      {anonimo ? <p className="text-secondaria text-grigio">{nomeCliente(a, true)}</p> : (
        <Link to={`/commerciale/clienti/${a.clientId}`} className="relative z-10 flex min-h-11 w-fit items-center gap-2 text-secondaria hover:underline">
          <LogoCliente logo={a.logo} nome={a.cliente} />
          <span>{a.cliente}</span>
        </Link>
      )}
      <p className="flex items-center gap-2 text-secondaria"><Punto colore={COLORE_STATO[a.status]} etichetta={ETICHETTE_AUTOMAZIONE[a.status]} />{ETICHETTE_AUTOMAZIONE[a.status]}</p>
      <p className="text-secondaria text-grigio tabular-nums">{passaggi === 0 ? "Flusso da descrivere" : passaggi === 1 ? "1 passaggio" : `${passaggi} passaggi`}</p>
      <p className="text-meta text-grigio tabular-nums">{a.monthlyCostCents != null ? `${euro(a.monthlyCostCents)} al mese di costi vivi` : "Costo vivo da segnare"}</p>
      {!anonimo && a.scope === "fuori_perimetro" && <span><Tag>Fuori perimetro</Tag></span>}
    </div>
  );
}

export function Pannello({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useAutomazioni();
  const anonimo = useAnonimo();
  const eyebrow = oggiLungo(ora);
  const interruttore = <Interruttore etichetta="Nomi dei clienti nascosti" aiuto="Settore e città al posto del nome, per mostrare lo schermo" acceso={anonimo} onCambia={setAnonimo} />;
  if (q.isLoading) return <div className="mx-auto grid max-w-[1100px] gap-6 p-4"><Intestazione titolo="Automazioni" eyebrow={eyebrow} />{interruttore}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="mx-auto grid max-w-[1100px] gap-6 p-4"><Intestazione titolo="Automazioni" eyebrow={eyebrow} />{interruttore}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const { automazioni, totali } = q.data!;
  const vive = automazioni.filter((a) => a.status !== "dismessa");
  const dismesse = automazioni.filter((a) => a.status === "dismessa");
  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 p-4">
      <Intestazione titolo="Automazioni" numero={totali.attive} coda={totali.attive === 1 ? "attiva" : "attive"} eyebrow={eyebrow} />
      {interruttore}
      <div className="grid gap-1 rounded-blocco border border-sabbia bg-avorio p-5">
        <p className="text-corpo tabular-nums">{`${totali.attive} attive`}</p>
        <p className="text-corpo tabular-nums">{`${totali.inCostruzione} in costruzione`}</p>
        <p className="text-corpo tabular-nums">{`${euro(totali.costiViviCents)} di costi vivi al mese`}</p>
      </div>
      {vive.length === 0 && <StatoVuoto titolo="Nessuna automazione" testo="La prima nasce dal +." />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{vive.map((a) => <li key={a.id}><CardAutomazione a={a} anonimo={anonimo} /></li>)}</ul>
      {dismesse.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-corpo font-semibold">{`Dismesse, ${dismesse.length}`}</summary>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dismesse.map((a) => <li key={a.id}><CardAutomazione a={a} anonimo={anonimo} /></li>)}</ul>
        </details>
      )}
    </div>
  );
}
