import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { eCallNelPassato } from "../../errori";
import { AreaTesto, Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { useStages } from "../../hooks";
import type { Esito, Proposta } from "../../../worker/regole/motore";
import type { Precompilato } from "../../../worker/calls/coach-routes";
import { CasellaInvito, useResendCollegato } from "./CasellaInvito";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioRimanda } from "./FoglioRimanda";
import { CampiMotivo } from "./lead/CampiMotivo";
import { CALL_DELL_ESITO, eSpeciale, etichettaScelta, esitiPerFase, type SceltaEsito, applicaProposta, corpoEsito, opzioniAzione, statoIniziale, testoTentativo, validaEsito, type LeadEsito, type StatoEsito } from "./esito";

// Foglio "Com'è andata?": l'esito propone fase e prossima azione (le regole propongono, la persona salva).
// "iniziale": i suggerimenti del coach. Il lead cambia solo con "Salva esito".
// Esiti filtrati per fase (esitiPerFase); "Ha firmato" e "Sì, firma" passano al foglio della chiusura, "Rimanda" al rinvio.
// Verso 80 il motivo è obbligatorio e il pulsante resta spento finché manca (contratto blocco 1, sezioni 2 e 7).
export function FoglioEsito({ lead, onChiudi, iniziale }: { lead: LeadEsito; onChiudi: () => void; iniziale?: Precompilato }) {
  const [passa, setPassa] = useState<null | "firmato" | "rimanda">(null);
  const qc = useQueryClient();
  const fasi = useStages();
  const coach = iniziale ? { ...iniziale, stageId: iniziale.stageId ?? undefined } : undefined;
  const [s, setS] = useState<StatoEsito>(() => statoIniziale(crypto.randomUUID(), lead, coach));
  // Solo l'ultima proposta chiesta vale: un esito cambiato in fretta non viene sovrascritto da una risposta vecchia.
  const ultimaRichiesta = useRef(0);
  const senzaEmail = lead.email === null;
  const [invito, setInvito] = useState(!senzaEmail);
  const kindCall = s.esito ? CALL_DELL_ESITO[s.esito] : undefined;
  const mandaInvito = !!kindCall && invito && !senzaEmail;
  // Senza Resend l'invito va in coda: il pulsante non promette un invio che non parte adesso.
  const resend = useResendCollegato();
  const fase = fasi.data?.find((f) => f.id === s.stageId);
  const cambiaFase = s.stageId !== lead.stageId;
  // PV2: il motivo serve solo se la fase cambia davvero verso una fase che lo chiede.
  // Il motivo si sceglie solo andando in 80: in 90 "Non profilato" è già il motivo.
  const motivoObbligatorio = cambiaFase && s.stageId === "non-chiuso";
  const aperta = !fase || fase.kind === "open";

  const scegliVoce = (e: SceltaEsito) => (eSpeciale(e) ? setPassa(e) : void scegli(e));
  const scegli = async (esito: Esito, callAt = s.callAt) => {
    setS((p) => ({ ...p, esito }));
    const n = ++ultimaRichiesta.current;
    const q = new URLSearchParams({ esito });
    if (callAt != null) q.set("callAt", String(callAt));
    try {
      const p = await api<Proposta>(`/leads/${lead.id}/proposta?${q}`);
      if (n !== ultimaRichiesta.current) return;
      // Con i suggerimenti del coach vincono loro, salvo appuntamento, non interessato e fuori target (vedi applicaProposta).
      setS((prima) => applicaProposta(prima, p, coach));
    } catch {
      if (n === ultimaRichiesta.current) toast("Nessuna proposta dalle regole: scegli fase e prossima azione a mano");
    }
  };

  const [erroreData, setErroreData] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api<{ callId: string | null }>(`/leads/${lead.id}/esito`, { method: "PATCH", json: corpoEsito(s) }),
    onSuccess: (r) => {
      // L'esito resta salvato anche se l'invito non parte: in quel caso un avviso sabbia, mai un errore rosso.
      if (mandaInvito && r.callId) {
        void api<{ ok: boolean; inCoda?: boolean }>(`/calls/${r.callId}/invito`, { method: "POST" })
          .then((x) => (x.inCoda ? toast("Esito salvato, invito in coda: partirà quando Resend sarà collegato") : toast.success("Esito salvato, invito mandato")))
          .catch((e: Error) => toast.warning(`Esito salvato. ${e.message}`))
          .finally(() => void qc.invalidateQueries({ queryKey: ["calls"] }));
      } else toast.success("Esito salvato");
      for (const k of [["today"], ["badge"], ["lead", lead.id], ["leads"], ["calls"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => (eCallNelPassato(e) ? setErroreData(e.message) : toast.error(e.message)),
  });
  const errore =
    validaEsito(s, motivoObbligatorio) ??
    (aperta && (!s.nextAction.trim() || s.nextActionAt == null) ? "Scegli la prossima azione e quando" : null);

  // Chiuso si segna dalla scheda lead (servono setup, canone e inizio): qui non si offre, salvo che il lead ci sia già.
  const opzioniFase = [...(fasi.data ?? [])]
    .filter((f) => f.kind !== "won" || f.id === lead.stageId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({ valore: f.id, etichetta: f.label }));

  const chiuso = fasi.data?.find((f) => f.kind === "won");
  if (passa === "rimanda") return <FoglioRimanda leadId={lead.id} onChiudi={onChiudi} />;
  if (passa === "firmato" && chiuso) {
    return <FoglioChiusura lead={{ id: lead.id, stageId: lead.stageId, company: lead.company, setupCents: lead.setupCents ?? null, feeCents: lead.feeCents ?? null }} fase={chiuso} onChiudi={onChiudi} />;
  }

  return (
    <Foglio
      aperto
      lato
      titolo="Com'è andata?"
      onChiudi={onChiudi}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={errore ?? undefined} onClick={() => salva.mutate()}>
          {mandaInvito && resend ? "Salva esito e manda l'invito" : "Salva esito"}
        </Pulsante>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-secondaria text-grigio">
          <p>{lead.company}</p>
          {/* I tentativi contano solo prima della consulenza. */}
          {["da-chiamare-prima-volta", "da-richiamare"].includes(lead.stageId) && <p className="tabular-nums">{testoTentativo(lead.attemptCount)}</p>}
        </div>
        <Selettore etichetta="Esito" apertoAllInizio opzioni={esitiPerFase(lead.stageId).map((e) => ({ valore: e, etichetta: etichettaScelta(e, lead.stageId) }))} valore={s.esito as SceltaEsito | null} onCambia={scegliVoce} />
        {s.esito && (
          <Selettore etichetta="Fase" valore={s.stageId || null} opzioni={opzioniFase}
            onCambia={(id) => setS((p) => ({ ...p, stageId: id, lostReason: id === lead.stageId ? null : p.lostReason }))} />
        )}
        {kindCall && s.esito && (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-secondaria font-medium">{kindCall === "conoscenza" ? "Consulenza (call di conoscenza)" : "Presentazione del preventivo"}</p>
            <CampoQuando etichetta="Data della call" valore={s.callAt}
              onCambia={(ms) => { setErroreData(null); setS((p) => ({ ...p, callAt: ms })); if (ms != null && s.esito) void scegli(s.esito, ms); }} errore={erroreData} />
            <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={s.meetLink} onChange={(e) => setS((p) => ({ ...p, meetLink: e.target.value }))} />
            <a className="self-start text-secondaria font-semibold text-accento-testo underline-offset-4 hover:underline" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
            <CasellaInvito attiva={invito} onCambia={setInvito} senzaEmail={senzaEmail} inCoda={!resend} />
          </div>
        )}
        {s.esito && motivoObbligatorio && (
          <CampiMotivo valore={s} onCambia={(m) => setS((p) => ({ ...p, ...m }))} />
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
