import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../api";
import { Selettore } from "../../ds";
import type { Stage } from "../../types";
import { callPerFase } from "../../../worker/regole/fasi-call";

// Il cambio di fase scelto a mano, uguale dalla pillola dell'intestazione e dal selettore in Dati del lead:
// immediato con "Annulla" nel toast; le fasi che chiedono il motivo, Cliente (setup, canone, inizio) e quelle con
// una call (giorno e ora) aprono il loro foglio. Azione e scadenza le calcola il server (contratto, sezione 2).
export function useCambioFase({ leadId, attuale, fasi, senzaAzione = false, onServeFoglio }: {
  leadId: string; attuale: string; fasi: Stage[]; senzaAzione?: boolean; onServeFoglio: (f: Stage) => void;
}) {
  const qc = useQueryClient();
  const sposta = useMutation({
    mutationFn: (stageId: string) => {
      // Un lead chiuso ha perso la prossima azione: riaprendolo ne serve una (riserva finché il server non la calcola da sé).
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
  const scegli = (id: string) => {
    const f = ordinate.find((x) => x.id === id);
    if (!f || id === attuale) return;
    if (f.requiresReason || f.kind === "won" || callPerFase(f.id)) onServeFoglio(f);
    else sposta.mutate(id);
  };
  return { ordinate, scegli, inCorso: sposta.isPending };
}

// Selettore a espansione della fase (Dati del lead).
export function StepperFasi(p: { leadId: string; attuale: string; fasi: Stage[]; senzaAzione?: boolean; onServeFoglio: (f: Stage) => void }) {
  const { ordinate, scegli } = useCambioFase(p);
  return <Selettore etichetta="Fase" valore={p.attuale} opzioni={ordinate.map((f) => ({ valore: f.id, etichetta: f.label }))} onCambia={scegli} />;
}
