import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api";
import { Button, Input, StageBadge } from "../components/ui";
import { useRefreshLeads, useStages } from "../hooks";
import { useQueryClient } from "@tanstack/react-query";

const KIND_LABELS = { open: "aperta", won: "vinta", lost: "persa" } as const;

export function Fasi() {
  const stages = useStages();
  const qc = useQueryClient();
  const refresh = useRefreshLeads();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["stages"] });
    refresh();
  };
  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => api(`/stages/${id}`, { method: "PATCH", json: { label } }),
    onSuccess: () => {
      done();
      toast.success("Fase rinominata");
    },
    onError: (e) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api("/stages/order", { method: "PUT", json: { ids } }),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const list = stages.data ?? [];
  function move(index: number, delta: number) {
    const ids = list.map((s) => s.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-4xl lowercase">fasi</h1>
      <p className="text-sm text-ink/60">Rinomina e riordina le fasi della scaletta. Il tipo (aperta, vinta, persa) decide se serve la prossima azione.</p>
      <ul className="space-y-2">
        {list.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink/5">
            <StageBadge label={KIND_LABELS[s.kind]} tone={s.tone} />
            <Input
              defaultValue={s.label}
              aria-label={`Nome della fase ${s.label}`}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (label && label !== s.label) rename.mutate({ id: s.id, label });
              }}
            />
            <Button variant="ghost" aria-label="Sposta su" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button variant="ghost" aria-label="Sposta giù" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
