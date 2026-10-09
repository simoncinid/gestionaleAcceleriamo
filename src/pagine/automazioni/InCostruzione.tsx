import { Link } from "react-router";
import { Errore, Intestazione, Skeleton, StatoVuoto } from "../../ds";
import { giorno } from "../../format";
import { useOra, useUsers } from "../../hooks";
import { useAutomazioni } from "../dati-gestione";
import { useAnonimo } from "./anonimo";
import { nomeCliente, oggiLungo } from "./Pannello";

// Spec 10.2: nome, cliente, data promessa, responsabile tecnico. Prima le promesse più vicine.
export function InCostruzione({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useAutomazioni();
  const utenti = useUsers();
  const anonimo = useAnonimo();
  const eyebrow = oggiLungo(ora);
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="In costruzione" eyebrow={eyebrow} /><Skeleton righe={5} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="In costruzione" eyebrow={eyebrow} /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const lista = q.data!.automazioni.filter((a) => a.status === "in_costruzione").sort((a, b) => (a.promisedAt ?? Infinity) - (b.promisedAt ?? Infinity));
  const tecnico = (id: string | null) => utenti.data?.find((u) => u.id === id)?.name ?? "da scegliere";
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 p-4">
      <Intestazione titolo="In costruzione" numero={lista.length} eyebrow={eyebrow} />
      {lista.length === 0 && <StatoVuoto titolo="Niente in costruzione" testo="L'automazione nuova nasce dal +." />}
      <ul className="grid gap-2">
        {lista.map((a) => (
          <li key={a.id}>
            <Link to={`/automazioni/${a.id}`} className="grid gap-1 rounded-blocco border border-sabbia bg-avorio p-5 hover:bg-crema">
              <p className="font-display text-titolo-card">{a.name}</p>
              <p className="text-corpo">{nomeCliente(a, anonimo)}</p>
              <p className="text-secondaria text-grigio tabular-nums">{a.promisedAt != null ? `Promessa per il ${giorno(a.promisedAt, ora)}` : "Senza data promessa"}</p>
              <p className="text-secondaria text-grigio">{`Responsabile tecnico: ${tecnico(a.techOwnerId)}`}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
