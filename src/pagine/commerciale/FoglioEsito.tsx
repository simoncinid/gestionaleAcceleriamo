import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { useStages } from "../../hooks";
import type { Esito, Proposta } from "../../../worker/regole/motore";
import { ESITI_PER_FREQUENZA, ETICHETTE_ESITO, corpoEsito, opzioniAzione, statoIniziale, testoTentativo, validaEsito, type StatoEsito } from "./esito";

type LeadEsito = { id: string; company: string; contactName: string | null; stageId: string; attemptCount: number };

// Foglio "Com'è andata?": l'esito propone fase e prossima azione (le regole propongono, la persona salva).
export function FoglioEsito({ lead, onChiudi }: { lead: LeadEsito; onChiudi: () => void }) {
  const qc = useQueryClient();
  const fasi = useStages();
  const motivi = useQuery({ queryKey: ["settings"], queryFn: () => api<{ motivi: { id: string; etichetta: string }[] }>("/settings") });
  const [s, setS] = useState<StatoEsito>(() => statoIniziale(crypto.randomUUID(), lead));
  // Solo l'ultima proposta chiesta vale: un esito cambiato in fretta non viene sovrascritto da una risposta vecchia.
  const ultimaRichiesta = useRef(0);
  const fase = fasi.data?.find((f) => f.id === s.stageId);
  const cambiaFase = s.stageId !== lead.stageId;
  // PV2: il motivo serve solo se la fase cambia davvero verso una fase che lo chiede.
  const motivoObbligatorio = cambiaFase && Boolean(fase?.requiresReason);
  const aperta = !fase || fase.kind === "open";

  const scegli = async (esito: Esito, callAt = s.callAt) => {
    setS((p) => ({ ...p, esito }));
    const n = ++ultimaRichiesta.current;
    const q = new URLSearchParams({ esito });
    if (callAt != null) q.set("callAt", String(callAt));
    try {
      const p = await api<Proposta>(`/leads/${lead.id}/proposta?${q}`);
      if (n !== ultimaRichiesta.current) return;
      setS((prima) => ({
        ...prima,
        stageId: p.stageId ?? prima.stageId,
        nextAction: p.nextAction ?? "",
        nextActionAt: p.nextActionAt,
        lostReason: p.lostReason ?? null,
      }));
    } catch {
      if (n === ultimaRichiesta.current) toast("Nessuna proposta dalle regole: scegli fase e prossima azione a mano");
    }
  };

  const salva = useMutation({
    mutationFn: () => api(`/leads/${lead.id}/esito`, { method: "PATCH", json: corpoEsito(s) }),
    onSuccess: () => {
      toast.success("Esito salvato");
      for (const k of [["today"], ["badge"], ["lead", lead.id], ["leads"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  const errore =
    validaEsito(s, motivoObbligatorio) ??
    (aperta && (!s.nextAction.trim() || s.nextActionAt == null) ? "Scegli la prossima azione e quando" : null);

  // Chiuso si segna dalla scheda lead (servono setup, canone e inizio): qui non si offre, salvo che il lead ci sia già.
  const opzioniFase = [...(fasi.data ?? [])]
    .filter((f) => f.kind !== "won" || f.id === lead.stageId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({ valore: f.id, etichetta: f.label }));

  return (
    <Foglio
      aperto
      titolo="Com'è andata?"
      onChiudi={onChiudi}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={errore ?? undefined} onClick={() => salva.mutate()}>
          Salva esito
        </Pulsante>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-secondaria text-grigio">
          <p>{lead.company}</p>
          <p className="tabular-nums">{testoTentativo(lead.attemptCount)}</p>
        </div>
        <Selettore etichetta="Esito" apertoAllInizio opzioni={ESITI_PER_FREQUENZA.map((e) => ({ valore: e, etichetta: ETICHETTE_ESITO[e] }))} valore={s.esito} onCambia={(e) => void scegli(e)} />
        {s.esito && (
          <Selettore etichetta="Fase" valore={s.stageId || null} opzioni={opzioniFase}
            onCambia={(id) => setS((p) => ({ ...p, stageId: id, lostReason: id === lead.stageId ? null : p.lostReason }))} />
        )}
        {s.esito === "appuntamento" && (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-secondaria font-medium">Call di conoscenza</p>
            <CampoQuando etichetta="Data della call" valore={s.callAt}
              onCambia={(ms) => { setS((p) => ({ ...p, callAt: ms })); if (ms != null) void scegli("appuntamento", ms); }} />
            <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={s.meetLink} onChange={(e) => setS((p) => ({ ...p, meetLink: e.target.value }))} />
            <a className="self-start text-secondaria font-semibold text-accento-testo underline-offset-4 hover:underline" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
          </div>
        )}
        {s.esito && (motivoObbligatorio || s.lostReason) && (
          <Selettore etichetta="Motivo" opzioni={(motivi.data?.motivi ?? []).map((m) => ({ valore: m.id, etichetta: m.etichetta }))} valore={s.lostReason} onCambia={(m) => setS((p) => ({ ...p, lostReason: m }))} />
        )}
        {s.esito && aperta && (
          <>
            <Selettore etichetta="Prossima azione" valore={s.nextAction || null} opzioni={opzioniAzione(s.nextAction)} onCambia={(a) => setS((p) => ({ ...p, nextAction: a }))} />
            <CampoQuando etichetta="Quando" valore={s.nextActionAt} onCambia={(ms) => setS((p) => ({ ...p, nextActionAt: ms }))} />
          </>
        )}
        {s.esito && <AreaTesto etichetta="Note" rows={2} placeholder="Cosa ha detto, in una riga" value={s.note} onChange={(e) => setS((p) => ({ ...p, note: e.target.value }))} />}
      </div>
    </Foglio>
  );
}
