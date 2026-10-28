import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../api";
import type { CallKind } from "../../../worker/db/schema";
import { callPerFase } from "../../../worker/regole/fasi-call";

// "Non si è presentato" (modifica 25): uno solo per scheda, Oggi e tabella Lead. Il tipo di call viene dalla fase
// (30 conoscenza, 40 offerta, 45 analisi, 55 progetto); il server decide fase e prossima azione.
export const callDellAssenza = (stageId: string): CallKind | null => callPerFase(stageId);

export function useNonPresentato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, kind }: { leadId: string; kind: CallKind }) => api(`/leads/${leadId}/no-show`, { method: "POST", json: { kind } }),
    onSuccess: (_r, { leadId }) => {
      toast.success("Segnato: non si è presentato");
      for (const k of [["lead", leadId], ["leads"], ["today"], ["badge"], ["calls"]]) void qc.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e.message),
  });
}
