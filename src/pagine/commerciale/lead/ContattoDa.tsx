import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api";
import type { CollegamentiScheda } from "../../../../worker/leads/collegamenti";
import type { RigaContatto as Dati } from "../../../types";
import { useCliente } from "../../dati-gestione";
import { RigaContatto } from "./RigaContatto";

// La riga del contatto (modifica 16) quando la pagina conosce solo il lead o solo il cliente:
// l'altro link si ricava da GET /leads/:id/collegamenti o da GET /clients/:id. Finché non arriva, la riga mostra
// il link che c'è già, così non salta.
export function ContattoDalLead({ leadId, azienda }: { leadId: string; azienda: string }) {
  const coll = useQuery({ queryKey: ["lead", leadId, "collegamenti"], queryFn: () => api<CollegamentiScheda>(`/leads/${leadId}/collegamenti`) });
  const dati: Dati = { azienda, leadId, clienteId: coll.data?.cliente?.id ?? null };
  return <RigaContatto contatto={dati} />;
}

export function ContattoDalCliente({ clienteId, azienda }: { clienteId: string; azienda: string }) {
  const q = useCliente(clienteId);
  const dati: Dati = { azienda, leadId: q.data?.lead?.id ?? null, clienteId };
  return <RigaContatto contatto={dati} />;
}
