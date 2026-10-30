import { ETICHETTE_CANONE, ETICHETTE_CLIENTE } from "../../../worker/economia/calcoli";
import { Errore, Intestazione, Riga, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro } from "../../format";
import type { ClienteRiga } from "../../types";
import { useClienti } from "../dati-gestione";

// QA 10: tre righe in ordine fisso per ogni cliente (nome, canone, stato). L'importo si vede sempre quando
// un canone esiste; "Nessun canone" solo senza canoni. Una sola chip di stato, sempre sulla terza riga:
// lo stato del canone se c'è, altrimenti lo stato del cliente. Il perimetro lo dice il gruppo, non una chip.
export const statoRigaCliente = (c: ClienteRiga) => (c.canone ? ETICHETTE_CANONE[c.canone.stato] : ETICHETTE_CLIENTE[c.stato].toLowerCase());

const RigaCliente = ({ c }: { c: ClienteRiga }) => (
  <Riga titolo={c.name} secondaria={c.canone ? `${euro(c.canone.cents)} al mese` : "Nessun canone"}
    meta={<span data-stato-cliente className="mt-1 inline-flex"><Tag>{statoRigaCliente(c)}</Tag></span>} href={`/commerciale/clienti/${c.id}`} />
);

const Gruppo = ({ titolo, clienti }: { titolo: string; clienti: ClienteRiga[] }) => clienti.length === 0 ? null : (
  <section className="grid gap-2">
    <h2 className="text-etichetta uppercase text-grigio">{titolo}</h2>
    <ul className="grid grid-cols-1 gap-2 @3xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">{clienti.map((c) => <li key={c.id}><RigaCliente c={c} /></li>)}</ul>
  </section>
);

// Spec 6.10: "per chi lavoriamo, e quanto ci paga ogni mese". Il cliente nuovo nasce dal "+".
export function Clienti() {
  const q = useClienti();
  if (q.isLoading) return <div className="p-4 md:p-0 md:pb-8"><Intestazione titolo="Clienti" eyebrow="Per chi lavoriamo" /><Skeleton righe={5} /></div>;
  if (q.error) return <div className="p-4 md:p-0 md:pb-8"><Intestazione titolo="Clienti" eyebrow="Per chi lavoriamo" /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  // Il canone in pausa resta "a canone": il cliente c'è ancora, il canone riprende. Prima gli attivi.
  // Come nel prototipo 18, i fuori perimetro (non cessati) hanno il loro gruppo.
  const nostri = q.data!.filter((c) => c.scope !== "fuori_perimetro" && c.stato !== "cessato");
  const aCanone = [...nostri.filter((c) => c.stato === "attivo"), ...nostri.filter((c) => c.stato === "in_pausa")];
  const inCostruzione = nostri.filter((c) => c.stato === "in_costruzione");
  const fuori = q.data!.filter((c) => c.scope === "fuori_perimetro" && c.stato !== "cessato");
  const cessati = q.data!.filter((c) => c.stato === "cessato");
  return (
    <div className="grid gap-4 p-4 md:p-0 md:pb-8">
      <Intestazione titolo="Clienti" numero={q.data!.length} eyebrow="Per chi lavoriamo" />
      {q.data!.length === 0 && <StatoVuoto titolo="Nessun cliente" testo="Il primo nasce dal +." />}
      <Gruppo titolo="A canone" clienti={aCanone} />
      <Gruppo titolo="In costruzione" clienti={inCostruzione} />
      <Gruppo titolo="Fuori perimetro" clienti={fuori} />
      {cessati.length > 0 && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center py-2 text-testo font-semibold">{`Cessati, ${cessati.length}`}</summary>
          <ul className="grid gap-2 pb-2 @3xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">{cessati.map((c) => <li key={c.id}><RigaCliente c={c} /></li>)}</ul>
        </details>
      )}
    </div>
  );
}
