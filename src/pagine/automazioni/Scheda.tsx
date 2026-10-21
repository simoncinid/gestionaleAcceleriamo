import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ETICHETTE_AUTOMAZIONE, FAMIGLIE, type Famiglia } from "../../../worker/economia/calcoli";
import { api } from "../../api";
import { AreaTesto, Campo, Errore, Intestazione, LogoCliente, Pulsante, Punto, Riga, Selettore, Skeleton, Tag } from "../../ds";
import { useUsers } from "../../hooks";
import { centesimi } from "../commerciale/scheda";
import type { AutomationStep } from "../../types";
import { usePassi } from "../lavori/dati";
import { useAutomazione, useRicarica } from "../dati-gestione";
import { Sezione } from "../impostazioni/parti";
import { useAnonimo } from "./anonimo";
import { Flusso, FoglioPasso, ordinaFlusso } from "./Flusso";
import { FoglioPassaggi } from "./FoglioPassaggi";
import { nomeCliente } from "./Pannello";
import { useStato } from "./Stato";
import { ETICHETTE_COLORE } from "../../../worker/stato/calcoli";

type Testo = "description" | "runsOn" | "stack" | "notes";

// Spec 10.3: primario "Segna attiva" solo se è in costruzione. I campi si salvano quando si esce, come nella 1A.
export function SchedaAutomazione({ id }: { id: string }) {
  const q = useAutomazione(id);
  const utenti = useUsers();
  const anonimo = useAnonimo();
  const ricarica = useRicarica();
  const passiQ = usePassi(id);
  const stato = useStato();
  const [passo, setPasso] = useState<AutomationStep | null>(null);
  const [modifica, setModifica] = useState(false);
  const patch = useMutation({
    mutationFn: (campi: Record<string, unknown>) => api(`/automations/${id}`, { method: "PATCH", json: campi }),
    onSuccess: () => { toast.success("Salvato"); ricarica(); },
    onError: (e) => toast.error(e.message),
  });
  const attiva = useMutation({
    mutationFn: () => api(`/automations/${id}/attiva`, { method: "POST" }),
    onSuccess: () => { toast.success("Automazione attiva"); ricarica(); },
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={8} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const a = q.data!;
  // Voce dello stato legata a questa scheda (battito esterno): il passo dell'ultimo errore evidenzia il passaggio rotto.
  const voce = stato.data?.find((v) => v.automationId === id);
  const rotto = voce?.colore === "rosso" ? voce.ultimoPasso : null;
  const persone = (utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name }));
  const alBlur = (campo: Testo, v: string) => {
    const t = v.trim();
    if (t !== (a[campo] ?? "")) patch.mutate({ [campo]: t || null });
  };
  const costo = (v: string) => {
    const t = v.trim();
    if (!t) {
      if (a.monthlyCostCents != null) patch.mutate({ monthlyCostCents: null });
      return;
    }
    const c = centesimi(t);
    if (c == null) return toast.error("Costo vivo: scrivi un importo in euro");
    if (c !== a.monthlyCostCents) patch.mutate({ monthlyCostCents: c });
  };
  return (
    <div key={a.updatedAt} className="mx-auto grid max-w-[1100px] gap-6 p-4 pb-28">
      <Intestazione titolo={a.name} eyebrow="Automazione">
        {anonimo ? <p className="text-corpo">{nomeCliente(a, true)}</p> : (
          <Link to={`/commerciale/clienti/${a.clientId}`} className="flex min-h-11 w-fit items-center gap-2 text-corpo hover:underline">
            <LogoCliente logo={a.logo} nome={a.cliente} misura={32} />{a.cliente}
          </Link>
        )}
        {!anonimo && a.scope === "fuori_perimetro" && <span><Tag>Fuori perimetro</Tag></span>}
        <p className="flex items-center gap-2 text-secondaria"><Punto colore={a.status === "attiva" ? "verde" : a.status === "in_costruzione" ? "giallo" : "grigio"} etichetta={ETICHETTE_AUTOMAZIONE[a.status]} />{ETICHETTE_AUTOMAZIONE[a.status]}</p>
      </Intestazione>
      {voce && (
        <Link to="/automazioni/stato" className="grid max-w-[720px] gap-0.5 rounded-blocco border border-sabbia bg-avorio px-4 py-3 hover:bg-crema">
          <span className="flex items-center gap-2 text-corpo font-semibold"><Punto colore={voce.colore} etichetta={ETICHETTE_COLORE[voce.colore]} />{`Stato: ${ETICHETTE_COLORE[voce.colore].toLowerCase()}`}</span>
          {voce.colore === "rosso" && voce.ultimoErrore && <span className="text-secondaria text-errore">{voce.ultimoErrore}</span>}
          {rotto && <span className="text-secondaria text-errore">{`Dove: ${rotto}`}</span>}
        </Link>
      )}
      <Sezione titolo="Flusso" coda={passiQ.data?.length ? passiQ.data.length === 1 ? "1 passaggio" : `${passiQ.data.length} passaggi` : undefined}>
        {passiQ.data && passiQ.data.length > 0
          ? <Flusso passi={passiQ.data} onApri={setPasso} rotto={rotto} />
          : <p className="text-secondaria text-grigio">Il flusso non è ancora descritto.</p>}
        <Pulsante variante="secondario" className="self-start" onClick={() => setModifica(true)}>Modifica passaggi</Pulsante>
      </Sezione>
      <div className="grid max-w-[720px] gap-6">
      <Sezione titolo="Cosa fa">
        <Selettore<Famiglia> etichetta="Famiglia" opzioni={[...FAMIGLIE]} valore={(a.family as Famiglia | null) ?? null} onCambia={(v) => patch.mutate({ family: v })} />
      </Sezione>
      <Sezione titolo="Dove gira">
        <Campo etichetta="Dove gira" aiuto="Per esempio: Cloudflare, Make, il computer del cliente" defaultValue={a.runsOn ?? ""} onBlur={(e) => alBlur("runsOn", e.target.value)} />
        <Campo etichetta="Stack" defaultValue={a.stack ?? ""} onBlur={(e) => alBlur("stack", e.target.value)} />
      </Sezione>
      <Sezione titolo="Costo vivo">
        <Campo etichetta="Al mese, in euro" inputMode="decimal" defaultValue={a.monthlyCostCents != null ? String(a.monthlyCostCents / 100).replace(".", ",") : ""} onBlur={(e) => costo(e.target.value)} />
      </Sezione>
      <Sezione titolo="Responsabili">
        <Selettore etichetta="Responsabile tecnico" opzioni={persone} valore={a.techOwnerId} onCambia={(v) => patch.mutate({ techOwnerId: v })} />
        <Selettore etichetta="PM" opzioni={persone} valore={a.pmOwnerId} onCambia={(v) => patch.mutate({ pmOwnerId: v })} />
      </Sezione>
      {a.proposalId && (
        <Sezione titolo="Proposta di origine">
          <Riga titolo={a.proposta ?? "Proposta"} href={`/commerciale/proposte/${a.proposalId}`} />
        </Sezione>
      )}
      <Sezione titolo="Note">
        {a.description && <AreaTesto etichetta="Descrizione" cresce defaultValue={a.description} onBlur={(e) => alBlur("description", e.target.value)} />}
        <AreaTesto etichetta="Note" cresce defaultValue={a.notes ?? ""} onBlur={(e) => alBlur("notes", e.target.value)} />
      </Sezione>
      </div>
      {passo && passiQ.data && <FoglioPasso passo={passo} numero={ordinaFlusso(passiQ.data).sigle.get(passo.id) ?? ""} onChiudi={() => setPasso(null)} />}
      {modifica && <FoglioPassaggi automazioneId={id} iniziali={passiQ.data ?? []} onChiudi={() => setModifica(false)} />}
      {a.status === "in_costruzione" && (
        <div className="sticky bottom-20 -mx-4 bg-crema px-4 py-3 md:bottom-4">
          <Pulsante variante="primario" misura="lg" className="w-full" inCorso={attiva.isPending} onClick={() => attiva.mutate()}>Segna attiva</Pulsante>
        </div>
      )}
    </div>
  );
}
