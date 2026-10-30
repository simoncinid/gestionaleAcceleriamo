import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api";

// Cose da fare aggiunte a mano su un lead (giro 2). Una chiave sola: la usano il Da fare e lo smistamento dei documenti.
export type TaskLead = { id: string; title: string; dueAt: number | null; doneAt: number | null; note: string | null };
export const chiaveTask = (leadId: string) => ["lead", leadId, "task"] as const;
export const useTaskDelLead = (leadId: string) =>
  useQuery({ queryKey: chiaveTask(leadId), queryFn: () => api<{ task: TaskLead[] }>(`/tasks?leadId=${encodeURIComponent(leadId)}&chi=tutte`) });
