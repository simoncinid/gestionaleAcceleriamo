import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { eCallNelPassato } from "../../errori";
import { Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { CasellaInvito, useResendCollegato } from "./CasellaInvito";
import type { CallKind } from "../../../worker/db/schema";
import { AZIONE_CALL } from "../../../worker/regole/fasi-call";

const TIPI = (Object.keys(AZIONE_CALL) as CallKind[]).map((k) => ({ valore: k, etichetta: AZIONE_CALL[k] }));

type Risposta = { invito: "mandato" | "in_coda" | "non_mandato" | "non_richiesto"; errore?: string };

// Foglio "Fissa call" dalla scheda lead: fissare è l'azione esplicita che applica fase e prossima azione del motore.
// Q14: aperto dal cambio di fase, il tipo è fissato dalla fase e il titolo dice dove va il lead.
export function FoglioFissaCall({ leadId, haEmail, onChiudi, fase, ritorno }: {
  leadId: string; haEmail: boolean; onChiudi: () => void; fase?: { label: string; kind: CallKind };
  ritorno?: RefObject<HTMLElement | null>;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<CallKind>(fase?.kind ?? "conoscenza");
  const [quando, setQuando] = useState<number | null>(null);
  const [meet, setMeet] = useState("");
  const [invito, setInvito] = useState(haEmail);
  const resend = useResendCollegato();
  const [erroreData, setErroreData] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api<Risposta>(`/leads/${leadId}/calls`, { method: "POST", json: { kind, scheduledAt: quando, meetLink: meet.trim() || null, invito } }),
    onSuccess: (r) => {
      // Invito non partito: avviso sabbia, la call è comunque salvata.
      if (r.invito === "non_mandato") toast.warning(`Call fissata. ${r.errore ?? "L'invito non è partito"}`);
      else if (r.invito === "in_coda") toast("Call fissata, invito in coda: partirà quando Resend sarà collegato");
      else toast.success(r.invito === "mandato" ? "Call fissata, invito mandato" : "Call fissata");
      for (const k of [["lead", leadId], ["calls"], ["today"], ["leads"], ["badge"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => (eCallNelPassato(e) ? setErroreData(e.message) : toast.error(e.message)),
  });
  return (
    <Foglio aperto lato titolo={fase ? `${fase.label}: quando è la call` : "Fissa call"} onChiudi={onChiudi} ritorno={ritorno}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={quando == null ? "Scegli giorno e ora" : undefined} onClick={() => salva.mutate()}>
          {invito && haEmail && resend ? "Fissa call e manda l'invito" : "Fissa call"}
        </Pulsante>
      }>
      <div className="flex flex-col gap-3">
        {!fase && <Selettore etichetta="Tipo" opzioni={TIPI} valore={kind} onCambia={setKind} />}
        <CampoQuando etichetta="Giorno e ora" valore={quando} onCambia={(ms) => { setQuando(ms); setErroreData(null); }} errore={erroreData} />
        <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={meet} onChange={(e) => setMeet(e.target.value)} />
        <a className="self-start text-nota font-semibold text-accento-testo underline-offset-4 hover:underline" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
        <CasellaInvito attiva={invito} onCambia={setInvito} senzaEmail={!haEmail} inCoda={!resend} />
      </div>
    </Foglio>
  );
}
