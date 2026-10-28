import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, CampoGiorno, Foglio, Pulsante } from "../../ds";
import type { PropostaRiga, Stage } from "../../types";
import { mancaMotivo } from "./esito";
import { CampiMotivo, type Motivo } from "./lead/CampiMotivo";
import { centesimi, precompilaChiusura } from "./scheda";

// Corpo del motivo: solo i campi che servono al codice scelto.
const corpoMotivo = (m: Motivo) => ({
  lostReason: m.lostReason,
  ...(m.lostReason === "altro" ? { lostNote: m.lostNote.trim() } : {}),
  ...(m.lostReason === "non_ora" && m.recontactAt != null ? { recontactAt: m.recontactAt } : {}),
});

// Foglio che si apre quando la fase cambia verso una persa (serve il motivo) o verso Chiuso (servono setup, canone e inizio).
// PV2: i dati sono obbligatori solo se la fase cambia davvero; sulla fase attuale il foglio non chiede nulla.
// Q6: setup, canone e nome partono dalla proposta accettata (o dai soldi del lead); i segnaposto restano solo senza dati.
// Alla chiusura il server crea il cliente con questo nome e il canone in attesa.
type LeadChiusura = { id: string; stageId: string; company: string; setupCents: number | null; feeCents: number | null };

export function FoglioChiusura({ lead, fase, onChiudi }: { lead: LeadChiusura; fase: Stage; onChiudi: () => void }) {
  const qc = useQueryClient();
  const vinto = fase.kind === "won";
  const cambia = fase.id !== lead.stageId;
  // In 80 il motivo è obbligatorio (con giorno o testo se serve); in 90 "Non profilato" è già il motivo.
  const chiedeMotivo = !vinto && fase.id === "non-chiuso";
  const [motivo, setMotivo] = useState<Motivo>({ lostReason: null, lostNote: "", recontactAt: null });
  const proposte = useQuery({ queryKey: ["lead", lead.id, "proposte"], queryFn: () => api<{ proposte: PropostaRiga[] }>(`/leads/${lead.id}/proposals`).then((r) => r.proposte), enabled: vinto });
  const iniziali = precompilaChiusura(lead, proposte.data);
  // null finché la persona non scrive: così i valori arrivati dopo dalla rete riempiono il campo.
  const [setupScritto, setSetup] = useState<string | null>(null);
  const [canoneScritto, setCanone] = useState<string | null>(null);
  const [nomeScritto, setNome] = useState<string | null>(null);
  const setup = setupScritto ?? iniziali.setup;
  const canone = canoneScritto ?? iniziali.canone;
  const nome = nomeScritto ?? iniziali.nome;
  const [inizio, setInizio] = useState<number | null>(null);
  const setupCents = centesimi(setup);
  const feeCents = centesimi(canone);
  const corpo = vinto ? { stageId: fase.id, setupCents, feeCents, wonStartAt: inizio, ...(cambia && nome.trim() ? { clientName: nome.trim() } : {}) } : { stageId: fase.id, ...(chiedeMotivo ? corpoMotivo(motivo) : {}) };
  const manca = !cambia
    ? undefined
    : vinto
      ? !nome.trim() ? "Scrivi il nome del cliente" : setupCents == null ? "Scrivi il setup in euro" : feeCents == null ? "Scrivi il canone mensile in euro" : inizio == null ? "Scegli la data di inizio" : undefined
      : chiedeMotivo ? (mancaMotivo(motivo) ?? undefined) : undefined;
  const salva = useMutation({
    mutationFn: () => api(`/leads/${lead.id}`, { method: "PATCH", json: corpo }),
    onSuccess: () => {
      toast.success(vinto ? "Cliente, ottimo" : `Spostato in ${fase.label}`);
      for (const k of [["lead", lead.id], ["leads"], ["today"], ["badge"], ["clienti"]]) void qc.invalidateQueries({ queryKey: k });
      onChiudi();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Foglio aperto lato titolo={vinto ? "Cliente: i dati del contratto" : `${fase.label}: perché`} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>{vinto && cambia ? "Chiudi e crea il cliente" : "Salva la chiusura"}</Pulsante>}>
      <div className="flex flex-col gap-3">
        {vinto ? (
          <>
            {cambia && <Campo etichetta="Nome del cliente" value={nome} onChange={(e) => setNome(e.target.value)} />}
            <Campo etichetta="Setup (euro)" inputMode="decimal" placeholder="1.800" value={setup} onChange={(e) => setSetup(e.target.value)} />
            <Campo etichetta="Canone mensile (euro)" inputMode="decimal" placeholder="150" value={canone} onChange={(e) => setCanone(e.target.value)} />
            <CampoGiorno etichetta="Data di inizio" valore={inizio} onCambia={setInizio} />
          </>
        ) : (
          chiedeMotivo ? <CampiMotivo apertoAllInizio valore={motivo} onCambia={setMotivo} /> : <p className="text-[15px]">Il lead esce dal giro delle chiamate: lo ritrovi nella tabella, filtro {fase.label}.</p>
        )}
      </div>
    </Foglio>
  );
}
