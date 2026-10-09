import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { BadgeDati } from "./guscio/BarraBasso";
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

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Contatori della barra (Commerciale, Economia) e punto sull'avatar. La rotta arriva nel Task 9:
// finché manca, la query fallisce in silenzio (niente avviso, niente stato di errore) e i badge non si vedono.
export const useBadge = () =>
  useQuery({ queryKey: ["badge"], queryFn: () => api<BadgeDati>("/badge"), staleTime: 30_000, refetchOnWindowFocus: true, retry: false });
