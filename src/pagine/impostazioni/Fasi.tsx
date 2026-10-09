import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Button, Input, StageBadge } from "../../components/ui";
import { useRefreshLeads, useStages } from "../../hooks";

const KIND_LABELS = { open: "aperta", won: "vinta", lost: "persa" } as const;

export function Fasi() {
  const stages = useStages();
  const qc = useQueryClient();
  const [resets, setResets] = useState(0);
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
    onError: (e) => {
      setResets((n) => n + 1);
      toast.error(e.message);
    },
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api("/stages/order", { method: "PUT", json: { ids } }),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const list = stages.data ?? [];
  const busy = reorder.isPending || stages.isFetching;
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
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink/5">
            <span className="order-1"><StageBadge label={KIND_LABELS[s.kind]} tone={s.tone} /></span>
            <Input
              key={`${s.id}-${s.label}-${resets}`}
              defaultValue={s.label}
              className="order-3 min-w-0 basis-full sm:order-2 sm:basis-0 sm:flex-1"
              aria-label={`Nome della fase ${s.label}`}
              onBlur={(e) => {
                const label = e.target.value.trim();
                if (!label) e.target.value = s.label;
                else if (label !== s.label) rename.mutate({ id: s.id, label });
              }}
            />
            <div className="order-2 ml-auto flex gap-2 sm:order-3 sm:ml-0">
              <Button variant="ghost" aria-label="Sposta su" onClick={() => move(i, -1)} disabled={busy || i === 0}>↑</Button>
              <Button variant="ghost" aria-label="Sposta giù" onClick={() => move(i, 1)} disabled={busy || i === list.length - 1}>↓</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
