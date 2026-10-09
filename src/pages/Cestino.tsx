import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api";
import { Button, Empty } from "../components/ui";
import { fmtDateTime } from "../format";
import { useRefreshLeads } from "../hooks";
import type { LeadListItem } from "../types";

export function Cestino() {
  const refresh = useRefreshLeads();
  const trash = useQuery({ queryKey: ["trash"], queryFn: () => api<{ leads: LeadListItem[] }>("/leads/trash").then((r) => r.leads) });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast.success("Ripristinato");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-4xl lowercase">cestino</h1>
      {trash.data && !trash.data.length && <Empty text="Il cestino è vuoto." />}
      <ul className="divide-y divide-ink/5 rounded-xl bg-white ring-1 ring-ink/5">
        {trash.data?.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="font-medium">{l.company}</span>
              <span className="text-sm text-ink/50"> · nel cestino dal {fmtDateTime(l.deletedAt)}</span>
            </span>
            <Button variant="ghost" onClick={() => restore.mutate(l.id)}>Ripristina</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
