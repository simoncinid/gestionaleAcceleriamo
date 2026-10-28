import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { eCallNelPassato } from "../../errori";
import { AreaTesto, Campo, CampoQuando, Foglio, Pulsante, Selettore } from "../../ds";
import { momento } from "../../format";
import type { CallAgenda } from "../../types";
import { ContattoDalLead } from "./lead/ContattoDa";
import { NOTE_CALL, leggiNote } from "./note-call";
import type { CallKind } from "../../../worker/db/schema";
import { AZIONE_CALL, CALL_SEGUENTE } from "../../../worker/regole/fasi-call";

type Esito = "fatta" | "saltata" | "rimandata";
const ESITI: { valore: Esito; etichetta: string }[] = [
  { valore: "fatta", etichetta: "Fatta" },
  { valore: "saltata", etichetta: "Saltata" },
  { valore: "rimandata", etichetta: "Rimandata" },
];

// La call che si fissa nello stesso foglio quando questa è appena fatta: dopo la conoscenza l'offerta, dopo l'offerta l'analisi.
export const seguenteDi = (k: { kind: CallKind; outcome: string | null }, esito: Esito | null): CallKind | null =>
  esito === "fatta" && k.outcome !== "fatta" ? (CALL_SEGUENTE[k.kind] ?? null) : null;

// Corpo del PATCH senza le note: esito, nuova data se rimandata, call seguente nel campo "prossima".
export function corpoCall(k: { kind: CallKind; outcome: string | null }, esito: Esito | null, pros: { scheduledAt: number | null; meetLink: string }, nuovaData: number | null = null) {
  const corpo: Record<string, unknown> = {};
  if (esito !== k.outcome) corpo.outcome = esito;
  if (esito === "rimandata" && nuovaData != null) corpo.scheduledAt = nuovaData;
  if (seguenteDi(k, esito) && pros.scheduledAt != null) corpo.prossima = { scheduledAt: pros.scheduledAt, meetLink: pros.meetLink.trim() || null };
  return corpo;
}

// Foglio della call: esito, eventuale nuova data o call seguente nello stesso foglio, poi le note dello schema 6.7.
export function FoglioCall({ k, onChiudi }: { k: CallAgenda; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(() => leggiNote(k.notes));
  const [esito, setEsito] = useState<Esito | null>(k.outcome);
  const [nuovaData, setNuovaData] = useState<number | null>(null);
  const [pres, setPres] = useState<number | null>(null);
  const [meet, setMeet] = useState("");
  const seguente = seguenteDi(k, esito);
  const corpo = { notes: JSON.stringify(note), ...corpoCall(k, esito, { scheduledAt: pres, meetLink: meet }, nuovaData) };
  const [erroreData, setErroreData] = useState<string | null>(null);
  const salva = useMutation({
    mutationFn: () => api(`/calls/${k.id}`, { method: "PATCH", json: corpo }),
    onSuccess: () => {
      toast.success("Call salvata");
      for (const q of [["calls"], ["lead", k.leadId], ["today"], ["leads"], ["badge"]]) void qc.invalidateQueries({ queryKey: q });
      onChiudi();
    },
    onError: (e) => (eCallNelPassato(e) ? setErroreData(e.message) : toast.error(e.message)),
  });
  return (
    <Foglio aperto titolo={AZIONE_CALL[k.kind]} onChiudi={onChiudi}
      principale={
        <Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={esito === "rimandata" && nuovaData == null ? "Scegli la nuova data" : undefined} onClick={() => salva.mutate()}>
          Salva la call
        </Pulsante>
      }>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <ContattoDalLead leadId={k.leadId} azienda={k.company} />
          <p className="text-secondaria text-grigio tabular-nums">{momento(k.scheduledAt)}</p>
        </div>
        <Selettore etichetta="Esito" opzioni={ESITI} valore={esito} onCambia={setEsito} />
        {esito === "rimandata" && <CampoQuando etichetta="Nuova data" valore={nuovaData} onCambia={(ms) => { setNuovaData(ms); setErroreData(null); }} errore={erroreData} />}
        {seguente && (
          <section className="flex flex-col gap-3 pt-1" aria-label={`Fissa la ${AZIONE_CALL[seguente].toLowerCase()}`}>
            <p className="text-secondaria font-medium">{AZIONE_CALL[seguente]}, se è già fissata</p>
            <CampoQuando etichetta="Giorno e ora" valore={pres} onCambia={(ms) => { setPres(ms); setErroreData(null); }} errore={erroreData} />
            <Campo etichetta="Link Meet" type="url" inputMode="url" placeholder="https://meet.google.com/..." value={meet} onChange={(e) => setMeet(e.target.value)} />
          </section>
        )}
        <p className="pt-1 text-secondaria font-medium">Note</p>
        {NOTE_CALL[k.kind].map((c) => (
          <AreaTesto key={c.chiave} etichetta={c.etichetta} rows={2} value={note[c.chiave] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [c.chiave]: e.target.value }))} />
        ))}
      </div>
    </Foglio>
  );
}
