import { Check } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { toast } from "sonner";
import { inizioGiornoRoma } from "../../../worker/lib/roma";
import { api } from "../../api";
import { cx } from "../../ds";
import { giorno } from "../../format";
import type { TaskRiga } from "../../types";
import { useRicaricaLavori } from "./dati";

// Una riga per task: spunta, titolo, cliente e scadenza. Spuntare la segna fatta e offre di annullare.
export function RigaTask({ t, ora, nomeResponsabile, senzaCliente = false }: { t: TaskRiga; ora: number; nomeResponsabile?: string; senzaCliente?: boolean }) {
  const ricarica = useRicaricaLavori();
  const annulla = useMutation({ mutationFn: () => api(`/tasks/${t.id}/fatta`, { method: "DELETE" }), onSuccess: ricarica, onError: (e) => toast.error(e.message) });
  const fatta = useMutation({
    mutationFn: () => api(`/tasks/${t.id}/fatta`, { method: "POST" }),
    onSuccess: () => { ricarica(); toast.success("Task fatta", { action: { label: "Annulla", onClick: () => annulla.mutate() } }); },
    onError: (e) => toast.error(e.message),
  });
  const scaduta = t.dueAt != null && !t.doneAt && t.dueAt < inizioGiornoRoma(ora);
  return (
    <li className="flex items-center gap-1 p-1 pr-4">
      <button type="button" aria-label={t.doneAt ? `Rimetti da fare ${t.title}` : `Segna fatta ${t.title}`} aria-pressed={!!t.doneAt} onClick={() => (t.doneAt ? annulla.mutate() : fatta.mutate())}
        className="inline-flex size-11 shrink-0 items-center justify-center">
        <span className={cx("inline-flex size-6 items-center justify-center rounded-full border-[1.5px]", t.doneAt ? "border-ink bg-ink text-avorio" : "border-ink bg-avorio")}>{!!t.doneAt && <Check size={14} weight="bold" aria-hidden />}</span>
      </button>
      <div className="min-w-0 flex-1 py-2">
        <p className={cx("text-corpo font-semibold break-words", !!t.doneAt && "text-grigio line-through")}>{t.title}</p>
        {!senzaCliente && t.cliente && t.clientId && <Link to={`/commerciale/clienti/${t.clientId}`} className="block text-secondaria text-grigio hover:underline">{t.cliente}</Link>}
        {nomeResponsabile && <p className="text-secondaria text-grigio">{nomeResponsabile}</p>}
      </div>
      <p className={cx("shrink-0 text-secondaria tabular-nums", scaduta ? "font-semibold text-errore" : "text-grigio")}>{t.dueAt != null ? giorno(t.dueAt, ora) : "Senza scadenza"}</p>
    </li>
  );
}
