import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, Foglio, Pulsante, Selettore } from "../../ds";
import { useRicarica } from "../dati-gestione";
import { PERIMETRI } from "./SchedaCliente";

export function FoglioNuovoCliente({ onChiudi }: { onChiudi: () => void }) {
  const ricarica = useRicarica();
  const vai = useNavigate();
  const [nome, setNome] = useState("");
  const [settore, setSettore] = useState("");
  const [citta, setCitta] = useState("");
  const [scope, setScope] = useState<"acceleriamo" | "fuori_perimetro">("acceleriamo");
  const salva = useMutation({
    mutationFn: () => api<{ cliente: { id: string } }>("/clients", { method: "POST", json: { name: nome.trim(), sector: settore.trim() || null, city: citta.trim() || null, scope } }),
    onSuccess: ({ cliente }) => { toast.success("Cliente salvato"); ricarica(); onChiudi(); void vai(`/commerciale/clienti/${cliente.id}`); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Nuovo cliente" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={nome.trim() ? undefined : "Scrivi il nome"} onClick={() => salva.mutate()}>Salva il cliente</Pulsante>}>
      <Campo etichetta="Nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo etichetta="Settore" aiuto="Come lo diresti: un'agenzia immobiliare" value={settore} onChange={(e) => setSettore(e.target.value)} />
      <Campo etichetta="Città" value={citta} onChange={(e) => setCitta(e.target.value)} />
      <Selettore etichetta="Perimetro" opzioni={PERIMETRI} valore={scope} onCambia={setScope} />
    </Foglio>
  );
}
