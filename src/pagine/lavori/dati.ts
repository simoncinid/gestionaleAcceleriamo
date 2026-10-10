import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { AutomationStep, JobTemplate, JobTemplateTask, TaskRiga } from "../../types";

export type ModelloLavoro = Pick<JobTemplate, "id" | "name" | "kind"> & { tasks: JobTemplateTask[] };
export type LavoroRiga = { id: string; clientId: string; cliente: string; name: string; startAt: number; feeCents: number | null; status: "attivo" | "concluso"; automationId: string | null };

export const useModelliLavoro = () => useQuery({ queryKey: ["lavori-tipo"], queryFn: () => api<{ modelli: ModelloLavoro[] }>("/job-templates").then((r) => r.modelli) });
export const useTask = (chi: "mie" | "tutte") => useQuery({ queryKey: ["tasks", chi], queryFn: () => api<{ task: TaskRiga[] }>(`/tasks?chi=${chi}`).then((r) => r.task), refetchInterval: 60_000 });
export const usePassi = (id: string) => useQuery({ queryKey: ["automazioni", id, "passi"], queryFn: () => api<{ passi: AutomationStep[] }>(`/automations/${id}/steps`).then((r) => r.passi) });

export function useRicaricaLavori() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["tasks", "clienti", "lavori-tipo", "automazioni", "leads", "lead", "economia"]) void qc.invalidateQueries({ queryKey: [k] });
  };
}
