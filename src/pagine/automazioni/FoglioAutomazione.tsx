import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { FAMIGLIE, type Famiglia } from "../../../worker/economia/calcoli";
import { api } from "../../api";
import { AreaTesto, Campo, Foglio, Pulsante, Selettore } from "../../ds";
import { daIsoGiorno } from "../../format";
import { useUsers } from "../../hooks";
import { opzioniClienti, useClienti, useRicarica } from "../dati-gestione";

export function FoglioNuovaAutomazione({ onChiudi }: { onChiudi: () => void }) {
  const clienti = useClienti();
  const utenti = useUsers();
  const ricarica = useRicarica();
  const vai = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [famiglia, setFamiglia] = useState<Famiglia | null>(null);
  const [descrizione, setDescrizione] = useState("");
  const [doveGira, setDoveGira] = useState("");
  const [promessa, setPromessa] = useState("");
  const [tecnico, setTecnico] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api<{ automazione: { id: string } }>("/automations", {
      method: "POST",
      json: { clientId, name: nome.trim(), family: famiglia, description: descrizione.trim() || null, runsOn: doveGira.trim() || null, promisedAt: promessa ? daIsoGiorno(promessa) : null, techOwnerId: tecnico },
    }),
    onSuccess: ({ automazione }) => { toast.success("Automazione salvata"); ricarica(); onChiudi(); void vai(`/automazioni/${automazione.id}`); },
    onError: (e) => toast.error(e.message),
  });
  const manca = !clientId ? "Scegli il cliente" : !nome.trim() ? "Scrivi il nome" : undefined;
  return (
    <Foglio aperto titolo="Nuova automazione" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva l'automazione</Pulsante>}>
      <Selettore etichetta="Cliente" opzioni={opzioniClienti(clienti.data ?? [], false)} valore={clientId} onCambia={setClientId} apertoAllInizio />
      <Campo etichetta="Nome" aiuto="Per esempio: Ordini da WhatsApp" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Selettore<Famiglia> etichetta="Famiglia" opzioni={[...FAMIGLIE]} valore={famiglia} onCambia={setFamiglia} />
      <AreaTesto etichetta="Cosa fa" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
      <Campo etichetta="Dove gira" value={doveGira} onChange={(e) => setDoveGira(e.target.value)} />
      <Campo etichetta="Data promessa" type="date" value={promessa} onChange={(e) => setPromessa(e.target.value)} />
      <Selettore etichetta="Responsabile tecnico" opzioni={(utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name }))} valore={tecnico} onCambia={setTecnico} />
    </Foglio>
  );
}
