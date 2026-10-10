import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ETICHETTE_AUTOMAZIONE, FAMIGLIE, etichettaFamiglia, type Famiglia } from "../../../worker/economia/calcoli";
import { api } from "../../api";
import { AreaTesto, Campo, Errore, Intestazione, Pulsante, Riga, Selettore, Skeleton, Tag } from "../../ds";
import { useUsers } from "../../hooks";
import { centesimi } from "../commerciale/scheda";
import { useAutomazione, useRicarica } from "../dati-gestione";
import { Sezione } from "../impostazioni/parti";
import { useAnonimo } from "./anonimo";
import { nomeCliente } from "./Pannello";

type Testo = "description" | "runsOn" | "stack" | "notes";

// Spec 10.3: primario "Segna attiva" solo se è in costruzione. I campi si salvano quando si esce, come nella 1A.
export function SchedaAutomazione({ id }: { id: string }) {
  const q = useAutomazione(id);
  const utenti = useUsers();
  const anonimo = useAnonimo();
  const ricarica = useRicarica();
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
    <div key={a.updatedAt} className="mx-auto grid max-w-[720px] gap-6 p-4 pb-28">
      <Intestazione titolo={a.name} eyebrow="Automazione">
        <p className="text-corpo">{nomeCliente(a, anonimo)}</p>
        {!anonimo && a.scope === "fuori_perimetro" && <span><Tag>Fuori perimetro</Tag></span>}
        <p className="text-secondaria">{etichettaFamiglia(a.family)}</p>
        <p className="text-secondaria text-grigio">{ETICHETTE_AUTOMAZIONE[a.status]}</p>
      </Intestazione>
      <Sezione titolo="Cosa fa">
        <Selettore<Famiglia> etichetta="Famiglia" opzioni={[...FAMIGLIE]} valore={(a.family as Famiglia | null) ?? null} onCambia={(v) => patch.mutate({ family: v })} />
        <AreaTesto etichetta="Descrizione" rows={4} defaultValue={a.description ?? ""} onBlur={(e) => alBlur("description", e.target.value)} />
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
        <AreaTesto etichetta="Note" rows={4} defaultValue={a.notes ?? ""} onBlur={(e) => alBlur("notes", e.target.value)} />
      </Sezione>
      {a.status === "in_costruzione" && (
        <div className="sticky bottom-20 -mx-4 bg-crema px-4 py-3 md:bottom-4">
          <Pulsante variante="primario" misura="lg" className="w-full" inCorso={attiva.isPending} onClick={() => attiva.mutate()}>Segna attiva</Pulsante>
        </div>
      )}
    </div>
  );
}
