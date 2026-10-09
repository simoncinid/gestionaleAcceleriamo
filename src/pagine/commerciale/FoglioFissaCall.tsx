import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { CasellaInvito } from "./CasellaInvito";

type Risposta = { invito: "mandato" | "non_mandato" | "non_richiesto"; errore?: string };

// Foglio "Fissa call" dalla scheda lead: fissare è l'azione esplicita che applica fase e prossima azione del motore.
export function FoglioFissaCall({ leadId, haEmail, onChiudi }: { leadId: string; haEmail: boolean; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"conoscenza" | "presentazione">("conoscenza");
  const [quando, setQuando] = useState<number | null>(null);
  const [meet, setMeet] = useState("");
  const [invito, setInvito] = useState(haEmail);
  const salva = useMutation({
    mutationFn: () => api<Risposta>(`/leads/${leadId}/calls`, { method: "POST", json: { kind, scheduledAt: quando, meetLink: meet.trim() || null, invito } }),
    onSuccess: (r) => {
      // Invito non partito: avviso sabbia, la call è comunque salvata.
      if (r.invito === "non_mandato") toast.warning(`Call fissata. ${r.errore ?? "L'invito non è partito"}`);
      else toast.success(r.invito === "mandato" ? "Call fissata, invito mandato" : "Call fissata");
      for (const k of [["lead", leadId], ["calls"], ["today"], ["leads"], ["badge"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto titolo="Fissa call" onChiudi={onChiudi}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={quando == null ? "Scegli giorno e ora" : undefined} onClick={() => salva.mutate()}>
          {invito ? "Fissa call e manda l'invito" : "Fissa call"}
        </Pulsante>
      }>
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Tipo" opzioni={[{ valore: "conoscenza", etichetta: "Conoscenza" }, { valore: "presentazione", etichetta: "Presentazione del preventivo" }]} valore={kind} onCambia={setKind} />
        <CampoQuando etichetta="Giorno e ora" valore={quando} onCambia={setQuando} />
        <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={meet} onChange={(e) => setMeet(e.target.value)} />
        <a className="self-start text-secondaria font-semibold text-accento-testo underline-offset-4 hover:underline" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
        <CasellaInvito attiva={invito} onCambia={setInvito} senzaEmail={!haEmail} />
      </div>
    </Foglio>
  );
}
