import { Link } from "react-router";
import { dataTesto } from "../../../../worker/processo/processo";
import { LINK } from "./stile";

// Il passaggio da lead a cliente, detto in una riga sotto il titolo (contratto blocco 1, modifica 15).
// Testo in linea, non flex: a 390 il link va a capo insieme alle parole, senza lasciare i due punti appesi.
// Nel lead in 70: "È cliente dal 14 ottobre: Apri il cliente". Nel cliente: "Nato dal lead X il 14 ottobre: Apri il lead".
// Giorno e mese non si separano andando a capo.
const data = (ms: number) => dataTesto(ms).replace(/^\S+ /, "").replace(" ", "\u00a0");

export function PassaggioCliente({ clienteId, dal }: { clienteId: string; dal: number }) {
  return (
    <p data-passaggio className="text-testo leading-[1.6]">
      È cliente dal {data(dal)}:{" "}
      <Link className={LINK} to={`/commerciale/clienti/${clienteId}`}>Apri il cliente</Link>
    </p>
  );
}

export function PassaggioLead({ leadId, azienda, il }: { leadId: string; azienda: string; il: number | null }) {
  return (
    <p data-passaggio className="text-testo leading-[1.6]">
      Nato dal lead {azienda}{il != null ? ` il ${data(il)}` : ""}:{" "}
      <Link className={LINK} to={`/commerciale/lead/${leadId}`}>Apri il lead</Link>
    </p>
  );
}
