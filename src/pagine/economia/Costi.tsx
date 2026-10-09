import { ETICHETTE_COSTO } from "../../../worker/economia/calcoli";
import { Errore, Intestazione, Riga, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro, giorno, nomeMese } from "../../format";
import type { CostoRiga } from "../../types";
import { useOra } from "../../hooks";
import { meseRoma } from "../../../worker/lib/roma";
import { useCosti } from "../dati-gestione";

const ListaCosti = ({ costi, ora }: { costi: CostoRiga[]; ora: number }) => (
  <ul className="grid gap-2">
    {costi.map((k) => (
      <li key={k.id}>
        <Riga titolo={k.note ?? k.automazione ?? k.cliente ?? ETICHETTE_COSTO[k.category]} secondaria={euro(k.amountCents)} meta={giorno(k.date, ora)} destra={<Tag>{ETICHETTE_COSTO[k.category]}</Tag>} />
      </li>
    ))}
  </ul>
);

// Spec 9.4: mese corrente con il totale, poi i mesi prima a scomparsa. Le righe automatiche (ads, Claude) arrivano nel Piano B.
export function Costi({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useCosti();
  const eyebrow = nomeMese(meseRoma(ora));
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Costi" eyebrow={eyebrow} /><Skeleton righe={6} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Costi" eyebrow={eyebrow} /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const [corrente, ...prima] = q.data!;
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 p-4">
      <Intestazione titolo="Costi" numero={euro(corrente.totaleCents)} coda="questo mese" eyebrow={eyebrow} />
      {corrente.costi.length === 0 ? <StatoVuoto titolo="Nessun costo questo mese" testo="Il costo nuovo nasce dal +." /> : <ListaCosti costi={corrente.costi} ora={ora} />}
      {prima.filter((m) => m.costi.length > 0).map((m) => (
        <details key={m.mese}>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-corpo font-semibold tabular-nums">{`${nomeMese(m.mese)}: ${euro(m.totaleCents)}`}</summary>
          <ListaCosti costi={m.costi} ora={ora} />
        </details>
      ))}
    </div>
  );
}
