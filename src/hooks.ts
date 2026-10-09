import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { BadgeDati } from "./guscio/BarraBasso";
import type { MessageTemplate } from "../worker/db/schema";
import type { Stage, User } from "./types";

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

// L'utente collegato: lo carica App con la chiave ["me"], qui si legge dalla cache.
export const useMe = () => useQueryClient().getQueryData<User | null>(["me"]) ?? null;

// Modelli dei messaggi (WhatsApp ed email), da compilare con riempiModello.
export const useModelli = () =>
  useQuery({ queryKey: ["templates"], queryFn: () => api<{ templates: MessageTemplate[] }>("/templates").then((r) => r.templates), staleTime: 300_000 });

// Un solo orologio per pagina: chiama onOra con l'istante corrente ogni `ogni` millisecondi. Restituisce lo stop.
export function avviaOrologio(onOra: (ora: number) => void, ogni: number) {
  const id = setInterval(() => onOra(Date.now()), ogni);
  return () => clearInterval(id);
}

// L'istante "adesso" che avanza da solo: timer delle 2 ore e scadenze non restano fermi
// quando i dati non cambiano. Con `fissa` (i test) l'orologio non parte.
export function useOra(ogni: number, fissa?: number) {
  const [ora, setOra] = useState(() => fissa ?? Date.now());
  useEffect(() => (fissa == null ? avviaOrologio(setOra, ogni) : undefined), [ogni, fissa]);
  return fissa ?? ora;
}
