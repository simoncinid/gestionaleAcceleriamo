import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Stage } from "./types";

export const useStages = () =>
  useQuery({ queryKey: ["stages"], queryFn: () => api<{ stages: Stage[] }>("/stages").then((r) => r.stages), staleTime: 60_000 });

export const useUsers = () =>
  useQuery({ queryKey: ["users"], queryFn: () => api<{ users: { id: string; name: string }[] }>("/users").then((r) => r.users), staleTime: 300_000 });

export function useRefreshLeads() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["leads", "lead", "today", "stats", "trash"]) void qc.invalidateQueries({ queryKey: [key] });
  };
}
