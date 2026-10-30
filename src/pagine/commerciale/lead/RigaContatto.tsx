import { Link } from "react-router";
import type { RigaContatto as Dati } from "../../../types";
import { LINK } from "./stile";

// Riga del contatto in cima a proposta, call, automazione e canone (contratto blocco 1, modifica 16):
// "<azienda>: Lead, Cliente". Un solo componente, gli stessi due link ovunque; il link che manca non si mostra.
export function RigaContatto({ contatto }: { contatto: Dati }) {
  const link = [
    contatto.leadId ? { to: `/commerciale/lead/${contatto.leadId}`, testo: "Lead" } : null,
    contatto.clienteId ? { to: `/commerciale/clienti/${contatto.clienteId}`, testo: "Cliente" } : null,
  ].filter((x): x is { to: string; testo: string } => x != null);
  return (
    <p data-riga-contatto className="flex flex-wrap items-center gap-x-1 text-testo">
      <span className="font-semibold">{contatto.azienda}{link.length > 0 && ":"}</span>
      {link.map((l, i) => (
        <span key={l.to} className="inline-flex items-center">
          <Link className={LINK} to={l.to}>{l.testo}</Link>
          {i < link.length - 1 && <span aria-hidden className="pr-1">,</span>}
        </span>
      ))}
    </p>
  );
}
