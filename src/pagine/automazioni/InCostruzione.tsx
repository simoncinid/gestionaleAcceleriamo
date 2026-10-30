import { Link } from "react-router";
import { Errore, Intestazione, Skeleton, StatoVuoto } from "../../ds";
import { ilGiorno } from "../../format";
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
  if (q.isLoading) return <div className="p-4 md:px-0"><Intestazione titolo="In costruzione" eyebrow={eyebrow} /><Skeleton righe={5} /></div>;
  if (q.error) return <div className="p-4 md:px-0"><Intestazione titolo="In costruzione" eyebrow={eyebrow} /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const lista = q.data!.automazioni.filter((a) => a.status === "in_costruzione").sort((a, b) => (a.promisedAt ?? Infinity) - (b.promisedAt ?? Infinity));
  const tecnico = (id: string | null) => utenti.data?.find((u) => u.id === id)?.name ?? "da scegliere";
  return (
    <div className="grid gap-4 p-4 md:px-0">
      <Intestazione titolo="In costruzione" numero={lista.length} eyebrow={eyebrow} />
      {lista.length === 0 && <StatoVuoto titolo="Niente in costruzione" testo="L'automazione nuova nasce dal +." />}
      <ul className="grid grid-cols-1 gap-2 @3xl:grid-cols-2 @7xl:grid-cols-3">
        {lista.map((a) => (
          <li key={a.id}>
            <Link to={`/automazioni/${a.id}`} className="grid gap-1 rounded-blocco border border-sabbia bg-avorio p-5 hover:bg-crema">
              <p className="font-display text-sezione">{a.name}</p>
              <p className="text-testo">{nomeCliente(a, anonimo)}</p>
              <p className="text-nota text-grigio tabular-nums">{a.promisedAt != null ? `Promessa per ${ilGiorno(a.promisedAt, ora)}` : "Senza data promessa"}</p>
              <p className="text-nota text-grigio">{`Responsabile tecnico: ${tecnico(a.techOwnerId)}`}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
