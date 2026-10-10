import { useState } from "react";
import { Chip, Errore, Intestazione, Skeleton, StatoVuoto } from "../../ds";
import { useMe, useOra, useUsers } from "../../hooks";
import { gruppoTask } from "../../../worker/lavori/calcoli";
import type { TaskRiga } from "../../types";
import { oggiLungo } from "../automazioni/Pannello";
import { useTask } from "./dati";
import { RigaTask } from "./RigaTask";

const GRUPPI = [
  { id: "in_ritardo", titolo: "In ritardo" },
  { id: "questa_settimana", titolo: "Questa settimana" },
  { id: "piu_avanti", titolo: "Più avanti" },
] as const;

// Automazioni, Lavori: le task aperte, mie o di tutti, raggruppate per urgenza.
export function Lavori({ ora: oraFissa }: { ora?: number } = {}) {
  const [chi, setChi] = useState<"mie" | "tutte">("mie");
  const ora = useOra(60_000, oraFissa);
  const q = useTask(chi);
  const utenti = useUsers();
  const me = useMe();
  const eyebrow = oggiLungo(ora);
  const nome = (t: TaskRiga) => (chi === "tutte" && t.assigneeId !== me?.id ? (utenti.data?.find((u) => u.id === t.assigneeId)?.name ?? "Senza responsabile") : undefined);
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Lavori" eyebrow={eyebrow} /><Skeleton righe={5} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Lavori" eyebrow={eyebrow} /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const task = q.data!;
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4 pb-8">
      <Intestazione titolo="Lavori" numero={task.length} coda="da fare" eyebrow={eyebrow} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-secondaria text-grigio">Di chi</span>
        <div className="flex gap-2" role="group" aria-label="Di chi">
          <Chip selezionato={chi === "mie"} onClick={() => setChi("mie")}>Mie</Chip>
          <Chip selezionato={chi === "tutte"} onClick={() => setChi("tutte")}>Tutte</Chip>
        </div>
      </div>
      {task.length === 0 && <StatoVuoto titolo="Niente da fare" testo="Le task di un lavoro nascono da sole. Una a mano nasce dal +." />}
      {GRUPPI.map((g) => {
        const righe = task.filter((t) => gruppoTask(t.dueAt, ora) === g.id);
        if (!righe.length) return null;
        return (
          <section key={g.id} aria-label={g.titolo} className="flex flex-col gap-3">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-titolo-card">{g.titolo}</h2>
              <span className="text-secondaria text-grigio tabular-nums">{righe.length}</span>
            </header>
            <ul className="divide-y divide-sabbia overflow-hidden rounded-blocco border border-sabbia bg-avorio">
              {righe.map((t) => <RigaTask key={t.id} t={t} ora={ora} nomeResponsabile={nome(t)} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
