import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { eCallNelPassato } from "../../errori";
import { AreaTesto, Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { useStages } from "../../hooks";
import type { Esito, Proposta } from "../../../worker/regole/motore";
import type { Precompilato } from "../../../worker/calls/coach-routes";
import { CasellaInvito, useResendCollegato } from "./CasellaInvito";
import { AZIONE_CALL } from "../../../worker/regole/fasi-call";
import { FoglioChiusura } from "./FoglioChiusura";
import { FoglioRimanda } from "./FoglioRimanda";
import { CampiMotivo } from "./lead/CampiMotivo";
import { CALL_DELL_ESITO, eSpeciale, etichettaScelta, esitiPerFase, type SceltaEsito, corpoEsito, statoIniziale, testoTentativo, validaEsito, type LeadEsito, type StatoEsito } from "./esito";
import { dataEOra } from "./lead/daFare";

// Foglio "Com'è andata?": la persona dice solo cosa è successo; fase, prossima azione e scadenza le calcola il server
// (corsia A, modifica 12). Il foglio le mostra in sola lettura ("Va in", "Poi") prima di salvare.
// Esiti filtrati per fase come il worker; "Ha firmato" e "Sì, firma" passano al foglio della chiusura, "Rimanda" al rinvio.
// "Non interessato" chiede il motivo: il pulsante resta spento finché manca (contratto blocco 1, sezioni 2 e 7).
// "iniziale": dal coach arriva solo la nota; fase e azione restano del server.
export function FoglioEsito({ lead, onChiudi, iniziale }: { lead: LeadEsito; onChiudi: () => void; iniziale?: Precompilato }) {
  const [passa, setPassa] = useState<null | "firmato" | "rimanda">(null);
  const qc = useQueryClient();
  const fasi = useStages();
  const [s, setS] = useState<StatoEsito>(() => statoIniziale(crypto.randomUUID(), lead, iniziale ? { note: iniziale.note ?? undefined } : undefined));
  // Solo l'ultima proposta chiesta vale: un esito cambiato in fretta non viene sovrascritto da una risposta vecchia.
  const ultimaRichiesta = useRef(0);
  const senzaEmail = lead.email === null;
  const [invito, setInvito] = useState(!senzaEmail);
  const kindCall = s.esito ? CALL_DELL_ESITO[s.esito] : undefined;
  const mandaInvito = !!kindCall && s.callAt != null && invito && !senzaEmail;
  // Senza Resend l'invito va in coda: il pulsante non promette un invio che non parte adesso.
  const resend = useResendCollegato();
  const verso = fasi.data?.find((f) => f.id === s.stageId);
  // Il motivo lo sceglie la persona solo quando dice "non interessato"; quelli automatici li mette il server.
  const motivoObbligatorio = s.esito === "non_interessato";

  const scegliVoce = (e: SceltaEsito) => (eSpeciale(e) ? setPassa(e) : void scegli(e));
  const scegli = async (esito: Esito, callAt = s.callAt) => {
    setS((p) => ({ ...p, esito, stageId: lead.stageId, nextAction: "", nextActionAt: null }));
    const n = ++ultimaRichiesta.current;
    const q = new URLSearchParams({ esito });
    if (callAt != null) q.set("callAt", String(callAt));
    try {
      const p = await api<Proposta>(`/leads/${lead.id}/proposta?${q}`);
      if (n !== ultimaRichiesta.current) return;
      setS((prima) => ({ ...prima, stageId: p.stageId ?? prima.stageId, nextAction: p.nextAction ?? "", nextActionAt: p.nextActionAt }));
    } catch {
      // Senza anteprima si salva lo stesso: decide il server.
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
  const errore = validaEsito(s, motivoObbligatorio);

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
          {/* I tentativi contano solo prima della conoscenza. */}
          {["da-chiamare-prima-volta", "da-richiamare"].includes(lead.stageId) && <p className="tabular-nums">{testoTentativo(lead.attemptCount)}</p>}
        </div>
        <Selettore etichetta="Esito" apertoAllInizio opzioni={esitiPerFase(lead.stageId).map((e) => ({ valore: e, etichetta: etichettaScelta(e, lead.stageId) }))} valore={s.esito as SceltaEsito | null} onCambia={scegliVoce} />
        {kindCall && s.esito && (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-secondaria font-medium">{AZIONE_CALL[kindCall]}{s.esito === "offerta_presentata" ? ", se è già fissata" : ""}</p>
            <CampoQuando etichetta="Data della call" valore={s.callAt}
              onCambia={(ms) => { setErroreData(null); setS((p) => ({ ...p, callAt: ms })); if (ms != null && s.esito) void scegli(s.esito, ms); }} errore={erroreData} />
            <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={s.meetLink} onChange={(e) => setS((p) => ({ ...p, meetLink: e.target.value }))} />
            <a className="self-start text-secondaria font-semibold text-accento-testo underline-offset-4 hover:underline" href="https://meet.new" target="_blank" rel="noreferrer">Crea su meet.new</a>
            <CasellaInvito attiva={invito} onCambia={setInvito} senzaEmail={senzaEmail} inCoda={!resend} />
          </div>
        )}
        {s.esito === "richiamare" && (
          <CampoQuando etichetta="Quando richiamare, se l'ha detto" valore={s.data} onCambia={(ms) => setS((p) => ({ ...p, data: ms }))} />
        )}
        {motivoObbligatorio && <CampiMotivo valore={s} onCambia={(m) => setS((p) => ({ ...p, ...m }))} />}
        {s.esito && (verso || s.nextAction) && (
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-[#E5DED4] pt-3 text-[15px]">
            {verso && verso.id !== lead.stageId && <><dt className="text-[13px] text-[#6B645C]">Va in</dt><dd>{verso.label}</dd></>}
            {s.nextAction && !(s.esito === "richiamare" && s.data != null) && (
              <><dt className="text-[13px] text-[#6B645C]">Poi</dt><dd>{s.nextAction}{s.nextActionAt != null && <span className="tabular-nums">, {dataEOra(s.nextActionAt).toLowerCase()}</span>}</dd></>
            )}
          </dl>
        )}
        {s.esito && <AreaTesto etichetta="Note" rows={2} placeholder="Cosa ha detto, in una riga" value={s.note} onChange={(e) => setS((p) => ({ ...p, note: e.target.value }))} />}
      </div>
    </Foglio>
  );
}
