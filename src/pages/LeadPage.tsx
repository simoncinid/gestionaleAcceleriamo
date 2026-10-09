import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "../api";
import { Button, Empty, Select } from "../components/ui";
import { SOURCE_LABELS } from "../format";
import { useRefreshLeads, useStages, useUsers } from "../hooks";
import type { Lead, LeadDetail } from "../types";
import { Documents } from "./lead/Documents";
import { LeadForm } from "./lead/LeadForm";
import { MetaAnswers } from "./lead/MetaAnswers";
import { NextActionCard } from "./lead/NextActionCard";
import { Timeline } from "./lead/Timeline";

export function LeadPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const refresh = useRefreshLeads();
  const stages = useStages();
  const users = useUsers();
  const detail = useQuery({ queryKey: ["lead", id], queryFn: () => api<LeadDetail>(`/leads/${id}`) });
  const onError = (e: Error) => toast.error(e.message);
  const patch = useMutation({
    mutationFn: (json: Record<string, unknown>) => api(`/leads/${id}`, { method: "PATCH", json }),
    onSuccess: () => {
      refresh();
      toast.success("Salvato");
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api(`/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Spostato nel cestino");
      navigate("/scaletta");
    },
    onError,
  });
  const merge = useMutation({
    mutationFn: (intoId: string) => api<{ lead: Lead }>(`/leads/${id}/merge`, { method: "POST", json: { intoId } }),
    onSuccess: ({ lead }) => {
      refresh();
      toast.success("Lead uniti");
      navigate(`/lead/${lead.id}`);
    },
    onError,
  });

  if (detail.isLoading) return <p className="text-ink/60">Caricamento…</p>;
  if (detail.error || !detail.data) return <Empty text={detail.error?.message ?? "Lead non trovato"} />;
  const { lead, activities, documents, duplicateOf } = detail.data;
  const stage = stages.data?.find((s) => s.id === lead.stageId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/scaletta" className="text-sm text-ink/50 hover:text-brand">‹ Scaletta</Link>
          <h1 className="text-4xl lowercase">{lead.company}</h1>
          <p className="text-ink/60">{[lead.contactName, SOURCE_LABELS[lead.source] ?? lead.source, lead.metaCampaign].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label="Fase" value={lead.stageId} onChange={(e) => patch.mutate({ stageId: e.target.value })} className="w-auto">
            {stages.data?.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <Button variant="danger" onClick={() => confirm("Spostare il lead nel cestino? Potrai ripristinarlo.") && remove.mutate()}>Cestino</Button>
        </div>
      </header>

      {duplicateOf && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <span>Sembra un doppione di <Link className="underline" to={`/lead/${duplicateOf.id}`}>{duplicateOf.company}</Link>.</span>
          <Button variant="ghost" onClick={() => confirm(`Unire questo lead in "${duplicateOf.company}"? Storico e documenti passano di là.`) && merge.mutate(duplicateOf.id)}>
            Unisci
          </Button>
        </div>
      )}
      {lead.metaStatus && lead.metaStatus !== "ok" && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">I dati del modulo Meta non sono ancora arrivati: riprovo da solo ogni 15 minuti.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <NextActionCard lead={lead} kind={stage?.kind} onSave={patch.mutate} pending={patch.isPending} />
          <LeadForm key={lead.updatedAt} lead={lead} users={users.data ?? []} onSave={patch.mutate} pending={patch.isPending} />
          <MetaAnswers lead={lead} />
        </div>
        <div className="space-y-6">
          <Timeline leadId={lead.id} activities={activities} />
          <Documents leadId={lead.id} documents={documents} />
        </div>
      </div>
    </div>
  );
}
