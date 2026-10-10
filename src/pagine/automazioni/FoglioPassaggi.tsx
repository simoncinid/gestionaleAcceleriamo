import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { AreaTesto, Campo, Foglio, Interruttore, Pulsante, Riga, Selettore } from "../../ds";
import type { AutomationStep } from "../../types";
import { useRicarica } from "../dati-gestione";
import { OPZIONI_ICONA } from "./Flusso";

type Bozza = Omit<AutomationStep, "automationId" | "position"> & { automationId?: string; position?: number };
const NUOVO = (): Bozza => ({ id: "", title: "", summary: "", branch: null, icon: "gear", tool: null, trigger: null, receives: null, produces: null, runsOn: null, risks: null, confirmed: false });

function FoglioUnPasso({ passo, onSalva, onChiudi }: { passo: Bozza; onSalva: (p: Bozza) => void; onChiudi: () => void }) {
  const [p, setP] = useState(passo);
  const testo = (campo: keyof Bozza) => ({ value: (p[campo] as string | null) ?? "", onChange: (e: { target: { value: string } }) => setP({ ...p, [campo]: e.target.value }) });
  return (
    <Foglio aperto titolo={p.title || "Nuovo passaggio"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" motivoSpento={p.title.trim() ? undefined : "Serve un titolo breve"} onClick={() => onSalva({ ...p, title: p.title.trim() })}>Salva il passaggio</Pulsante>}>
      <Campo etichetta="Titolo breve" {...testo("title")} />
      <AreaTesto etichetta="Cosa succede, in una frase" cresce {...testo("summary")} />
      <Selettore etichetta="Icona" opzioni={OPZIONI_ICONA} valore={p.icon ?? "gear"} onCambia={(v) => setP({ ...p, icon: v })} />
      <Campo etichetta="Etichetta sulla linea" aiuto="Solo se il flusso si divide, per esempio: Senza zona" {...testo("branch")} />
      <Campo etichetta="Strumento o servizio" {...testo("tool")} />
      <Campo etichetta="Quando parte" {...testo("trigger")} />
      <Campo etichetta="Cosa riceve" {...testo("receives")} />
      <Campo etichetta="Cosa produce" {...testo("produces")} />
      <Campo etichetta="Dove gira" {...testo("runsOn")} />
      <AreaTesto etichetta="Cosa può andare storto" cresce {...testo("risks")} />
      <Interruttore etichetta="Dato confermato" aiuto="Spento: compare Da confermare con Diego" acceso={p.confirmed} onCambia={(v) => setP({ ...p, confirmed: v })} />
    </Foglio>
  );
}

// "Modifica passaggi": elenco con frecce su e giù; un tocco su un passaggio lo apre per modificarlo. Salva scrive l'elenco intero.
export function FoglioPassaggi({ automazioneId, iniziali, onChiudi }: { automazioneId: string; iniziali: AutomationStep[]; onChiudi: () => void }) {
  const ricarica = useRicarica();
  const [lista, setLista] = useState<Bozza[]>(iniziali);
  const [aperto, setAperto] = useState<number | "nuovo" | null>(null);
  const sposta = (i: number, d: -1 | 1) => setLista((l) => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const salva = useMutation({
    mutationFn: () => api(`/automations/${automazioneId}/steps`, { method: "PUT", json: { passi: lista.map((p) => ({ ...(p.id ? { id: p.id } : {}), title: p.title, summary: p.summary, branch: p.branch, icon: p.icon, tool: p.tool, trigger: p.trigger, receives: p.receives, produces: p.produces, runsOn: p.runsOn, risks: p.risks, confirmed: p.confirmed })) } }),
    onSuccess: () => { toast.success("Passaggi salvati"); ricarica(); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  if (aperto !== null) {
    const base = aperto === "nuovo" ? NUOVO() : lista[aperto];
    return <FoglioUnPasso passo={base} onChiudi={() => setAperto(null)} onSalva={(p) => { setLista((l) => (aperto === "nuovo" ? [...l, p] : l.map((x, i) => (i === aperto ? p : x)))); setAperto(null); }} />;
  }
  return (
    <Foglio aperto titolo="Modifica passaggi" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} onClick={() => salva.mutate()}>Salva i passaggi</Pulsante>}>
      <ul className="flex flex-col gap-2">
        {lista.map((p, i) => (
          <li key={p.id || `n${i}`} className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><Riga titolo={`${i + 1}. ${p.title}`} secondaria={p.branch ?? p.summary} onClick={() => setAperto(i)} /></div>
            <Pulsante variante="icona" aria-label={`Sposta su ${p.title}`} className="w-11 px-0!" motivoSpento={i === 0 ? "È già il primo" : undefined} icona={<ArrowUp size={18} weight="bold" aria-hidden />} onClick={() => sposta(i, -1)} />
            <Pulsante variante="icona" aria-label={`Sposta giù ${p.title}`} className="w-11 px-0!" motivoSpento={i === lista.length - 1 ? "È già l'ultimo" : undefined} icona={<ArrowDown size={18} weight="bold" aria-hidden />} onClick={() => sposta(i, 1)} />
            <Pulsante variante="fantasma" aria-label={`Togli ${p.title}`} onClick={() => setLista((l) => l.filter((_, k) => k !== i))}>Togli</Pulsante>
          </li>
        ))}
      </ul>
      <Pulsante variante="secondario" className="self-start" onClick={() => setAperto("nuovo")}>Aggiungi un passaggio</Pulsante>
    </Foglio>
  );
}
