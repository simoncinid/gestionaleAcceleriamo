import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ETICHETTE_AUTOMAZIONE, ETICHETTE_CANONE, ETICHETTE_CLIENTE } from "../../../worker/economia/calcoli";
import { api } from "../../api";
import { Campo, Errore, Intestazione, LogoCliente, Pulsante, Riga, Selettore, Skeleton, type Opzione } from "../../ds";
import { euro, giorno } from "../../format";
import { useOra } from "../../hooks";
import { useCliente, useRicarica } from "../dati-gestione";
import { RigaFattura } from "../economia/Fatture";
import { FoglioAvvioLavoro } from "../lavori/FoglioAvvioLavoro";
import { RigaTask } from "../lavori/RigaTask";
import { Sezione } from "../impostazioni/parti";
import type { LeadDetail } from "../../types";
import { PassaggioLead } from "./lead/Passaggio";

type Perimetro = "acceleriamo" | "fuori_perimetro";
export const PERIMETRI: Opzione<Perimetro>[] = [
  { valore: "acceleriamo", etichetta: "Acceleriamo" },
  { valore: "fuori_perimetro", etichetta: "Fuori perimetro", meta: "Non entra in Economia" },
];

// Spec 6.10, scheda essenziale: dati, canoni, automazioni, ultime cinque fatture. Nessun primario.
// Il lead di origine è una riga sotto il titolo (blocco 1, modifica 15): "Nato dal lead X il <data>: Apri il lead".
export function SchedaCliente({ id, ora: oraFissa }: { id: string; ora?: number }) {
  const ora = useOra(60_000, oraFissa);
  const q = useCliente(id);
  const ricarica = useRicarica();
  const [avvio, setAvvio] = useState(false);
  // Data del passaggio: quando il lead di origine è entrato in Cliente.
  const origine = q.data?.lead?.id;
  const leadOrigine = useQuery({ queryKey: ["lead", origine], queryFn: () => api<LeadDetail>(`/leads/${origine}`), enabled: !!origine });
  const patch = useMutation({
    mutationFn: (campi: Record<string, string | null>) => api(`/clients/${id}`, { method: "PATCH", json: campi }),
    onSuccess: () => { toast.success("Salvato"); ricarica(); },
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <div className="p-4 md:p-0 md:pb-8"><Skeleton righe={8} /></div>;
  if (q.error) return <div className="p-4 md:p-0 md:pb-8"><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const { cliente: k, canoni, automazioni, fatture, lead } = q.data!;
  const lavori = q.data!.lavori ?? [];
  const task = q.data!.task ?? [];
  const alBlur = (campo: "name" | "sector" | "city", v: string) => {
    const t = v.trim();
    if (t === (k[campo] ?? "")) return;
    if (campo === "name" && !t) return toast.error("Il cliente ha bisogno di un nome");
    patch.mutate({ [campo]: campo === "name" ? t : t || null });
  };
  return (
    <div key={`${k.name}:${k.sector}:${k.city}`} className="grid gap-6 p-4 md:p-0 md:pb-8 @4xl:grid-cols-2 @4xl:items-start @4xl:gap-x-8 @7xl:grid-cols-3">
      <div className="@4xl:col-span-full">
      <Intestazione titolo={k.name} eyebrow="Cliente">
        <div className="flex items-center gap-2"><LogoCliente logo={k.logo} nome={k.name} misura={32} /><p className="text-secondaria text-grigio">{ETICHETTE_CLIENTE[k.stato]}</p></div>
        {lead && <PassaggioLead leadId={lead.id} azienda={lead.company} il={leadOrigine.data?.lead.stageId === "chiuso" ? leadOrigine.data.lead.stageChangedAt : null} />}
      </Intestazione>
      </div>
      <Sezione titolo="Lavori">
        {lavori.length === 0 ? <p className="text-secondaria text-grigio">Nessun lavoro</p> : (
          <ul className="grid gap-2">{lavori.map((l) => <li key={l.id}><Riga titolo={l.name} secondaria={`Avviato il ${giorno(l.startAt, ora)}${l.feeCents ? `, ${euro(l.feeCents)} al mese` : ""}`} meta={l.status === "concluso" ? "Concluso" : undefined} /></li>)}</ul>
        )}
        <Pulsante variante="secondario" className="justify-self-start" onClick={() => setAvvio(true)}>Assegna un lavoro</Pulsante>
      </Sezione>
      {task.length > 0 && (
        <Sezione titolo="Task aperte" coda={String(task.length)}>
          <ul className="divide-y divide-sabbia overflow-hidden rounded-blocco border border-sabbia bg-avorio">{task.map((t) => <RigaTask key={t.id} t={t} ora={ora} senzaCliente />)}</ul>
        </Sezione>
      )}
      <Sezione titolo="Dati">
        <Campo etichetta="Nome" defaultValue={k.name} onBlur={(e) => alBlur("name", e.target.value)} />
        <Campo etichetta="Settore" aiuto="Come lo diresti: un'agenzia immobiliare" defaultValue={k.sector ?? ""} onBlur={(e) => alBlur("sector", e.target.value)} />
        <Campo etichetta="Città" defaultValue={k.city ?? ""} onBlur={(e) => alBlur("city", e.target.value)} />
        <Selettore etichetta="Perimetro" opzioni={PERIMETRI} valore={k.scope} onCambia={(v) => patch.mutate({ scope: v })} />
      </Sezione>
      <Sezione titolo="Canoni">
        {canoni.length === 0 ? <p className="text-secondaria text-grigio">Nessun canone</p> : (
          <ul className="grid grid-cols-1 gap-2">{canoni.map((c) => <li key={c.id}><Riga titolo={`${euro(c.amountCents)} al mese`} secondaria={ETICHETTE_CANONE[c.status]} meta={`Fatturazione il giorno ${c.billingDay}`} /></li>)}</ul>
        )}
      </Sezione>
      <Sezione titolo="Automazioni">
        {automazioni.length === 0 ? <p className="text-secondaria text-grigio">Nessuna automazione</p> : (
          <ul className="grid grid-cols-1 gap-2">{automazioni.map((a) => <li key={a.id}><Riga titolo={a.name} secondaria={ETICHETTE_AUTOMAZIONE[a.status]} href={`/automazioni/${a.id}`} /></li>)}</ul>
        )}
      </Sezione>
      {k.scope === "acceleriamo" && (
        <Sezione titolo="Ultime fatture">
          {fatture.length === 0 ? <p className="text-secondaria text-grigio">Nessuna fattura</p> : (
            <ul className="grid grid-cols-1 gap-2">{fatture.map((f) => <li key={f.id}><RigaFattura f={f} ora={ora} /></li>)}</ul>
          )}
        </Sezione>
      )}
      {avvio && <FoglioAvvioLavoro clientId={k.id} nomeCliente={k.name} canoneIniziale={k.canone?.cents ?? null} onChiudi={() => setAvvio(false)} />}
    </div>
  );
}
