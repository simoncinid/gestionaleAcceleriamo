import { ETICHETTE_CLIENTE } from "../../../worker/economia/calcoli";
import { Errore, Intestazione, Riga, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro } from "../../format";
import type { ClienteRiga } from "../../types";
import { useClienti } from "../dati-gestione";

const RigaCliente = ({ c }: { c: ClienteRiga }) => (
  <Riga titolo={c.name} secondaria={c.canoneCents > 0 ? `${euro(c.canoneCents)} al mese` : "Nessun canone"} meta={ETICHETTE_CLIENTE[c.stato]}
    destra={c.scope === "fuori_perimetro" ? <Tag>Fuori perimetro</Tag> : undefined} href={`/commerciale/clienti/${c.id}`} />
);

// Spec 6.10: "per chi lavoriamo, e quanto ci paga ogni mese". Il cliente nuovo nasce dal "+".
export function Clienti() {
  const q = useClienti();
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Clienti" eyebrow="Per chi lavoriamo" /><Skeleton righe={5} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Clienti" eyebrow="Per chi lavoriamo" /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const vivi = q.data!.filter((c) => c.stato !== "cessato");
  const cessati = q.data!.filter((c) => c.stato === "cessato");
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 p-4">
      <Intestazione titolo="Clienti" numero={q.data!.length} eyebrow="Per chi lavoriamo" />
      {q.data!.length === 0 && <StatoVuoto titolo="Nessun cliente" testo="Il primo nasce dal +." />}
      <ul className="grid gap-2">{vivi.map((c) => <li key={c.id}><RigaCliente c={c} /></li>)}</ul>
      {cessati.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-corpo font-semibold">{`Cessati, ${cessati.length}`}</summary>
          <ul className="grid gap-2 pb-2">{cessati.map((c) => <li key={c.id}><RigaCliente c={c} /></li>)}</ul>
        </details>
      )}
    </div>
  );
}
