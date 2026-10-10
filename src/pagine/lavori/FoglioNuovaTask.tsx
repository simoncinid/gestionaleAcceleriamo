import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Campo, CampoGiorno, Foglio, Pulsante, Selettore } from "../../ds";
import { useMe, useUsers } from "../../hooks";
import { opzioniClienti, useClienti } from "../dati-gestione";
import { useRicaricaLavori } from "./dati";

// Task a mano, dal "+" di Automazioni. Il cliente è facoltativo; il responsabile parte da chi la crea.
export function FoglioNuovaTask({ onChiudi, clientId }: { onChiudi: () => void; clientId?: string }) {
  const ricarica = useRicaricaLavori();
  const utenti = useUsers();
  const clienti = useClienti();
  const me = useMe();
  const [titolo, setTitolo] = useState("");
  const [cliente, setCliente] = useState<string | null>(clientId ?? null);
  const [resp, setResp] = useState<string | null>(null);
  const [scadenza, setScadenza] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const salva = useMutation({
    mutationFn: () => api("/tasks", { method: "POST", json: { title: titolo, clientId: cliente, assigneeId: resp ?? me?.id ?? null, dueAt: scadenza, note: nota || null } }),
    onSuccess: () => { toast.success("Task creata"); ricarica(); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Nuova task" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={titolo.trim() ? undefined : "Scrivi cosa c'è da fare"} onClick={() => salva.mutate()}>Crea la task</Pulsante>}>
      <Campo etichetta="Cosa c'è da fare" autoFocus value={titolo} onChange={(e) => setTitolo(e.target.value)} />
      <Selettore etichetta="Cliente" segnaposto="Nessuno" opzioni={opzioniClienti(clienti.data ?? [], false)} valore={cliente} onCambia={setCliente} />
      <Selettore etichetta="Responsabile" opzioni={(utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name }))} valore={resp ?? me?.id ?? null} onCambia={setResp} />
      <CampoGiorno etichetta="Scadenza" valore={scadenza} onCambia={setScadenza} />
      <AreaTesto etichetta="Nota" cresce value={nota} onChange={(e) => setNota(e.target.value)} />
    </Foglio>
  );
}
