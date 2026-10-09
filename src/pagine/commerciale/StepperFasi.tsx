import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../api";
import { Selettore } from "../../ds";
import type { Stage } from "../../types";

// Selettore a espansione della fase: il cambio è immediato, con "Annulla" nel toast.
// Le fasi che chiedono il motivo e Chiuso (setup, canone, inizio) aprono il loro foglio.
export function StepperFasi({ leadId, attuale, fasi, senzaAzione = false, onServeFoglio }: {
  leadId: string; attuale: string; fasi: Stage[]; senzaAzione?: boolean; onServeFoglio: (f: Stage) => void;
}) {
  const qc = useQueryClient();
  const sposta = useMutation({
    mutationFn: (stageId: string) => {
      // Un lead chiuso ha perso la prossima azione: riaprendolo ne serve una, da cambiare poi nella scheda.
      const riapre = senzaAzione && fasi.find((f) => f.id === stageId)?.kind === "open";
      return api(`/leads/${leadId}`, { method: "PATCH", json: riapre ? { stageId, nextAction: "Ricontattare", nextActionAt: Date.now() } : { stageId } });
    },
    onSuccess: (_r, stageId) => {
      for (const k of [["lead", leadId], ["leads"], ["today"], ["badge"]]) void qc.invalidateQueries({ queryKey: k });
      const nome = fasi.find((f) => f.id === stageId)?.label ?? "";
      if (stageId !== attuale) toast(`Spostato in ${nome}`, { action: { label: "Annulla", onClick: () => sposta.mutate(attuale) } });
    },
    onError: (e) => toast.error(e.message),
  });
  const ordinate = [...fasi].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Selettore etichetta="Fase" valore={attuale} opzioni={ordinate.map((f) => ({ valore: f.id, etichetta: f.label }))}
      onCambia={(id) => {
        const f = ordinate.find((x) => x.id === id);
        if (!f || id === attuale) return;
        if (f.requiresReason || f.kind === "won") onServeFoglio(f);
        else sposta.mutate(id);
      }} />
  );
}
