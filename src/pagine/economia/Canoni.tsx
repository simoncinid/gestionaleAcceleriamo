import { useState } from "react";
import { Link } from "react-router";
import { LINK } from "../commerciale/lead/stile";
import { ETICHETTE_CANONE } from "../../../worker/economia/calcoli";
import { Errore, Intestazione, Riga, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro } from "../../format";
import { useOra } from "../../hooks";
import type { CanoneRiga } from "../../types";
import { useCanoni } from "../dati-gestione";
import { FoglioCanone } from "./Fogli";

// La riga apre il foglio del canone; sotto, fuori dal pulsante, il link all'automazione che il canone paga
// (blocco 1, modifica 16): dall'automazione la riga del contatto porta al lead e al cliente.
const RigaCanone = ({ c, onClick }: { c: CanoneRiga; onClick: () => void }) => (
  <div className="flex flex-col">
    <Riga titolo={c.cliente} secondaria={`${euro(c.amountCents)} al mese`} meta={`Fatturazione il giorno ${c.billingDay}`} destra={<Tag>{ETICHETTE_CANONE[c.status]}</Tag>} onClick={onClick} />
    {c.automationId && <Link className={`${LINK} self-start px-4 text-testo`} to={`/automazioni/${c.automationId}`}>Apri l'automazione</Link>}
  </div>
);

// Spec 9.2: nessun primario; il canone nuovo nasce dal "+", le azioni stanno nel foglio del canone.
export function Canoni({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useCanoni();
  const [aperto, setAperto] = useState<CanoneRiga | null>(null);
  if (q.isLoading) return <div className="p-4 md:px-0 md:pt-0"><Intestazione titolo="Canoni" eyebrow="Ricorrente firmato" /><Skeleton righe={6} /></div>;
  if (q.error) return <div className="p-4 md:px-0 md:pt-0"><Intestazione titolo="Canoni" eyebrow="Ricorrente firmato" /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const vivi = q.data!.filter((c) => c.status !== "cessato");
  const cessati = q.data!.filter((c) => c.status === "cessato");
  const attivi = vivi.filter((c) => c.status === "attivo").reduce((t, c) => t + c.amountCents, 0);
  return (
    <div className="grid gap-4 p-4 md:px-0 md:pt-0 md:pb-8">
      <Intestazione titolo="Canoni" numero={euro(attivi)} coda="al mese" eyebrow="Ricorrente firmato" />
      {vivi.length === 0 && <StatoVuoto titolo="Nessun canone" testo="Il primo nasce dal +." />}
      <ul className="grid grid-cols-1 gap-2 @5xl:grid-cols-2 @7xl:grid-cols-3">{vivi.map((c) => <li key={c.id}><RigaCanone c={c} onClick={() => setAperto(c)} /></li>)}</ul>
      {cessati.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-testo font-semibold">{`Cessati, ${cessati.length}`}</summary>
          <ul className="grid gap-2 pb-2 @5xl:grid-cols-2 @7xl:grid-cols-3">{cessati.map((c) => <li key={c.id}><RigaCanone c={c} onClick={() => setAperto(c)} /></li>)}</ul>
        </details>
      )}
      {aperto && <FoglioCanone c={aperto} ora={ora} onChiudi={() => setAperto(null)} />}
    </div>
  );
}
