import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Campo, Errore, Foglio, Intestazione, Pulsante, Riga, Selettore, Skeleton, StatoVuoto, type Opzione } from "../../ds";
import { useUsers } from "../../hooks";
import { TIPI_LAVORO, ammette } from "../../../worker/lavori/calcoli";
import { Aggiungi } from "../impostazioni/parti";
import { useModelliLavoro, useRicaricaLavori, type ModelloLavoro } from "./dati";

type Tipo = keyof typeof TIPI_LAVORO;
type Ricorrenza = "una_tantum" | "ricorrente";
type BozzaTask = { id?: string; title: string; recurrence: Ricorrenza; assigneeId: string | null; dueDays: string; monthDay: string };
type Bozza = { id: string | null; name: string; kind: Tipo; tasks: BozzaTask[] };

const TIPI: Opzione<Tipo>[] = (Object.keys(TIPI_LAVORO) as Tipo[]).map((k) => ({ valore: k, etichetta: TIPI_LAVORO[k] }));
const RICORRENZE: Opzione<Ricorrenza>[] = [{ valore: "una_tantum", etichetta: "Una tantum" }, { valore: "ricorrente", etichetta: "Ogni mese" }];

const daModello = (m: ModelloLavoro): Bozza => ({
  id: m.id, name: m.name, kind: m.kind,
  tasks: m.tasks.map((t) => ({ id: t.id, title: t.title, recurrence: t.recurrence, assigneeId: t.assigneeId, dueDays: t.dueDays != null ? String(t.dueDays) : "", monthDay: t.monthDay != null ? String(t.monthDay) : "" })),
});
const numero = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));

function FoglioTask({ task, kind, onSalva, onChiudi }: { task: BozzaTask; kind: Tipo; onSalva: (t: BozzaTask) => void; onChiudi: () => void }) {
  const utenti = useUsers();
  const [t, setT] = useState(task);
  const mensile = t.recurrence === "ricorrente";
  const giorno = numero(t.monthDay);
  const manca = !t.title.trim() ? "Serve un titolo" : mensile && (giorno == null || giorno < 1 || giorno > 28) ? "Il giorno del mese va da 1 a 28" : !mensile && numero(t.dueDays) == null ? "Scrivi dopo quanti giorni scade" : undefined;
  return (
    <Foglio aperto titolo={t.title || "Nuova task"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" motivoSpento={manca} onClick={() => onSalva({ ...t, title: t.title.trim() })}>Salva la task</Pulsante>}>
      <Campo etichetta="Titolo" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
      {kind === "una_tantum_ricorrente" && <Selettore etichetta="Quando" opzioni={RICORRENZE} valore={t.recurrence} onCambia={(v) => setT({ ...t, recurrence: v })} />}
      <Selettore etichetta="Responsabile predefinito" segnaposto="Nessuno" opzioni={(utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name }))} valore={t.assigneeId} onCambia={(v) => setT({ ...t, assigneeId: v })} />
      {mensile
        ? <Campo etichetta="Giorno del mese" inputMode="numeric" aiuto="Da 1 a 28. La task nasce quel giorno, una per mese" value={t.monthDay} onChange={(e) => setT({ ...t, monthDay: e.target.value })} />
        : <Campo etichetta="Entro quanti giorni dall'avvio" inputMode="numeric" value={t.dueDays} onChange={(e) => setT({ ...t, dueDays: e.target.value })} />}
    </Foglio>
  );
}

function FoglioLavoroTipo({ iniziale, onChiudi }: { iniziale: Bozza; onChiudi: () => void }) {
  const ricarica = useRicaricaLavori();
  const utenti = useUsers();
  const [b, setB] = useState(iniziale);
  const [aperta, setAperta] = useState<number | "nuova" | null>(null);
  const [secondoTocco, setSecondoTocco] = useState(false);
  const sposta = (i: number, d: -1 | 1) => setB((x) => { const n = [...x.tasks]; [n[i], n[i + d]] = [n[i + d], n[i]]; return { ...x, tasks: n }; });
  const corpo = () => ({
    name: b.name.trim(), kind: b.kind,
    tasks: b.tasks.map((t) => ({ ...(t.id ? { id: t.id } : {}), title: t.title, recurrence: t.recurrence, assigneeId: t.assigneeId, dueDays: t.recurrence === "una_tantum" ? numero(t.dueDays) : null, monthDay: t.recurrence === "ricorrente" ? numero(t.monthDay) : null })),
  });
  const fatto = (testo: string) => { toast.success(testo); ricarica(); onChiudi(); };
  const salva = useMutation({
    mutationFn: () => (b.id ? api(`/job-templates/${b.id}`, { method: "PUT", json: corpo() }) : api("/job-templates", { method: "POST", json: corpo() })),
    onSuccess: () => fatto("Lavoro tipo salvato"),
    onError: (e) => toast.error(e.message),
  });
  const cancella = useMutation({ mutationFn: () => api(`/job-templates/${b.id}`, { method: "DELETE" }), onSuccess: () => fatto("Lavoro tipo cancellato"), onError: (e) => toast.error(e.message) });
  if (aperta !== null) {
    const base: BozzaTask = aperta === "nuova" ? { title: "", recurrence: b.kind === "ricorrente" ? "ricorrente" : "una_tantum", assigneeId: null, dueDays: "", monthDay: "" } : b.tasks[aperta];
    return <FoglioTask task={base} kind={b.kind} onChiudi={() => setAperta(null)} onSalva={(t) => { setB((x) => ({ ...x, tasks: aperta === "nuova" ? [...x.tasks, t] : x.tasks.map((y, i) => (i === aperta ? t : y)) })); setAperta(null); }} />;
  }
  const incompatibile = b.tasks.find((t) => !ammette(b.kind, t.recurrence));
  const manca = !b.name.trim() ? "Serve un nome" : incompatibile ? `"${incompatibile.title}" non è del tipo ${TIPI_LAVORO[b.kind].toLowerCase()}` : undefined;
  const dettaglio = (t: BozzaTask) => {
    const chi = utenti.data?.find((u) => u.id === t.assigneeId)?.name ?? "Nessun responsabile";
    return `${chi}, ${t.recurrence === "ricorrente" ? `ogni mese il giorno ${t.monthDay}` : `entro ${t.dueDays} giorni dall'avvio`}`;
  };
  return (
    <Foglio aperto titolo={b.id ? b.name || "Lavoro tipo" : "Nuovo lavoro tipo"} onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={manca} onClick={() => salva.mutate()}>Salva il lavoro tipo</Pulsante>}>
      <Campo etichetta="Nome" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
      <Selettore etichetta="Tipo" opzioni={TIPI} valore={b.kind} onCambia={(v) => setB({ ...b, kind: v })} />
      <p className="text-secondaria font-medium">Task standard</p>
      <ul className="flex flex-col gap-2">
        {b.tasks.map((t, i) => (
          <li key={t.id ?? `n${i}`} className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><Riga titolo={t.title} secondaria={dettaglio(t)} onClick={() => setAperta(i)} /></div>
            <Pulsante variante="icona" aria-label={`Sposta su ${t.title}`} className="w-11 px-0!" motivoSpento={i === 0 ? "È già la prima" : undefined} icona={<ArrowUp size={18} weight="bold" aria-hidden />} onClick={() => sposta(i, -1)} />
            <Pulsante variante="icona" aria-label={`Sposta giù ${t.title}`} className="w-11 px-0!" motivoSpento={i === b.tasks.length - 1 ? "È già l'ultima" : undefined} icona={<ArrowDown size={18} weight="bold" aria-hidden />} onClick={() => sposta(i, 1)} />
          </li>
        ))}
      </ul>
      <Aggiungi onClick={() => setAperta("nuova")}>Aggiungi una task</Aggiungi>
      {b.id && (
        <Pulsante variante={secondoTocco ? "distruttivo" : "fantasma"} className="self-start" inCorso={cancella.isPending} onClick={() => (secondoTocco ? cancella.mutate() : setSecondoTocco(true))}>
          {secondoTocco ? "Tocca di nuovo per cancellare" : "Cancella il lavoro tipo"}
        </Pulsante>
      )}
    </Foglio>
  );
}

// Impostazioni, Lavori tipo: i modelli da cui nascono i lavori e le loro task.
export function LavoriTipo() {
  const q = useModelliLavoro();
  const [aperto, setAperto] = useState<Bozza | null>(null);
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Skeleton righe={4} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const modelli = q.data!;
  return (
    <div className="mx-auto grid max-w-[720px] gap-4 p-4 pb-28">
      <Intestazione eyebrow="Impostazioni" titolo="Lavori tipo" />
      {modelli.length === 0 && <StatoVuoto titolo="Nessun lavoro tipo" testo="Il primo nasce dal link qui sotto." />}
      <ul className="grid gap-2">
        {modelli.map((m) => (
          <li key={m.id}><Riga titolo={m.name} secondaria={TIPI_LAVORO[m.kind]} meta={`${m.tasks.length} task standard`} onClick={() => setAperto(daModello(m))} /></li>
        ))}
      </ul>
      <Aggiungi onClick={() => setAperto({ id: null, name: "", kind: "una_tantum_ricorrente", tasks: [] })}>Aggiungi un lavoro tipo</Aggiungi>
      {aperto && <FoglioLavoroTipo key={aperto.id ?? "nuovo"} iniziale={aperto} onChiudi={() => setAperto(null)} />}
    </div>
  );
}
