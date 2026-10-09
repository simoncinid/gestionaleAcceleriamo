import { useMutation, useQuery } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api } from "../api";
import { NewLeadDialog } from "../components/NewLeadDialog";
import { Button, Input, Select, StageBadge, cx } from "../components/ui";
import { SOURCE_LABELS, fmtDateTime } from "../format";
import { useDebounced, useRefreshLeads, useStages, useUsers } from "../hooks";
import type { LeadListItem } from "../types";

export function Scaletta() {
  const stages = useStages();
  const users = useUsers();
  const refresh = useRefreshLeads();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams(Object.entries({ q: debouncedQ, source, campaign, ownerId }).filter(([, v]) => v)).toString();
  const leads = useQuery({ queryKey: ["leads", params], queryFn: () => api<{ leads: LeadListItem[] }>(`/leads?${params}`).then((r) => r.leads),
    placeholderData: keepPreviousData,
  });
  const campaigns = useQuery({
    queryKey: ["leads", "campaigns"],
    queryFn: () =>
      api<{ leads: LeadListItem[] }>("/leads?source=meta").then((r) => [...new Set(r.leads.map((l) => l.metaCampaign).filter((c): c is string => !!c))].sort()),
  });
  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api(`/leads/${id}`, { method: "PATCH", json: { stageId } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const visible = (stages.data ?? []).filter((s) => showClosed || s.kind === "open");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl lowercase">scaletta</h1>
        <Button onClick={() => setCreating(true)}>Nuovo lead</Button>
      </header>
      <div className="flex flex-wrap gap-2">
        <Input className="sm:w-80!" placeholder="Cerca azienda, referente, email, telefono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca" />
        <Select className="sm:w-auto!" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Fonte">
          <option value="">Tutte le fonti</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="sm:w-auto!" value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campagna">
          <option value="">Tutte le campagne</option>
          {campaigns.data?.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="sm:w-auto!" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Responsabile">
          <option value="">Tutti</option>
          {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Mostra chiusi e persi
        </label>
      </div>
      {leads.error && <p className="text-red-700">{leads.error.message}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visible.map((stage) => {
          const items = (leads.data ?? []).filter((l) => l.stageId === stage.id);
          return (
            <section
              key={stage.id}
              aria-label={stage.label}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/lead");
                const lead = leads.data?.find((l) => l.id === id);
                if (lead && lead.stageId !== stage.id) move.mutate({ id, stageId: stage.id });
              }}
              className="w-72 shrink-0 rounded-xl bg-white/50 p-2 ring-1 ring-ink/5"
            >
              <header className="flex items-center justify-between px-2 py-1">
                <StageBadge label={stage.label} tone={stage.tone} />
                <span className="text-xs text-ink/50">{items.length}</span>
              </header>
              <div className="mt-2 flex min-h-12 flex-col gap-2">
                {items.map((l) => <LeadCard key={l.id} lead={l} ownerName={users.data?.find((u) => u.id === l.ownerId)?.name} />)}
              </div>
            </section>
          );
        })}
      </div>
      {creating && <NewLeadDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function LeadCard({ lead, ownerName }: { lead: LeadListItem; ownerName?: string }) {
  const overdue = lead.nextActionAt != null && lead.nextActionAt < Date.now();
  return (
    <Link
      to={`/lead/${lead.id}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/lead", lead.id)}
      className="block rounded-lg bg-white p-3 shadow-sm ring-1 ring-ink/5 hover:ring-brand/40"
    >
      <p className="font-medium">{lead.company}</p>
      {lead.contactName && <p className="text-sm text-ink/60">{lead.contactName}</p>}
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        <span className="rounded bg-ink/5 px-1.5 py-0.5">{SOURCE_LABELS[lead.source] ?? lead.source}</span>
        {lead.metaCampaign && <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">{lead.metaCampaign}</span>}
        {lead.duplicateOfId && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Possibile doppione</span>}
        {lead.metaStatus && lead.metaStatus !== "ok" && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">Dati Meta in arrivo</span>}
      </div>
      {lead.nextAction && (
        <p className={cx("mt-2 text-xs", overdue ? "font-medium text-red-700" : "text-ink/60")}>
          {lead.nextAction} · {fmtDateTime(lead.nextActionAt)}
        </p>
      )}
      {ownerName && <p className="mt-1 text-xs text-ink/40">{ownerName}</p>}
    </Link>
  );
}
