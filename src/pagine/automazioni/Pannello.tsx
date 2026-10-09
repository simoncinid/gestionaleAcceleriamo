import { Link } from "react-router";
import { descrizioneAnonima, ETICHETTE_AUTOMAZIONE, etichettaFamiglia } from "../../../worker/economia/calcoli";
import { Errore, Interruttore, Intestazione, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro } from "../../format";
import { useOra } from "../../hooks";
import type { AutomazioneRiga } from "../../types";
import { useAutomazioni } from "../dati-gestione";
import { setAnonimo, useAnonimo } from "./anonimo";

// Soprattitolo delle due pagine di Automazioni: il giorno, sul fuso di Roma.
const GIORNO_LUNGO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
export const oggiLungo = (ora: number) => GIORNO_LUNGO.format(ora);

export const nomeCliente = (a: AutomazioneRiga, anonimo: boolean) => (anonimo ? descrizioneAnonima(a.settore, a.citta) : a.cliente);

// Una riga per fatto, nell'ordine della spec 10.1.
function CardAutomazione({ a, anonimo }: { a: AutomazioneRiga; anonimo: boolean }) {
  return (
    <Link to={`/automazioni/${a.id}`} className="grid h-full gap-1 rounded-blocco border border-sabbia bg-avorio p-5 hover:bg-crema">
      <p className="font-display text-titolo-card">{a.name}</p>
      <p className="text-secondaria text-grigio">{nomeCliente(a, anonimo)}</p>
      <p className="text-secondaria">{etichettaFamiglia(a.family)}</p>
      {a.runsOn && <p className="text-secondaria">{`Gira su ${a.runsOn}`}</p>}
      <p className="text-meta text-grigio tabular-nums">{a.monthlyCostCents != null ? `${euro(a.monthlyCostCents)} al mese di costi vivi` : "Costo vivo da segnare"}</p>
      <p className="text-meta">{ETICHETTE_AUTOMAZIONE[a.status]}</p>
      {!anonimo && a.scope === "fuori_perimetro" && <span><Tag>Fuori perimetro</Tag></span>}
    </Link>
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
