import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Opzione } from "../ds";
import type { AutomazioneRiga, CanoneRiga, ClienteRiga, Cruscotto, FatturaRiga, MeseCosti, SchedaClienteDati } from "../types";

export type DatiPannello = { automazioni: AutomazioneRiga[]; totali: { attive: number; inCostruzione: number; costiViviCents: number } };

export const useCruscotto = () => useQuery({ queryKey: ["economia", "cruscotto"], queryFn: () => api<Cruscotto>("/economia/cruscotto") });
export const useFatture = () => useQuery({ queryKey: ["economia", "fatture"], queryFn: () => api<{ fatture: FatturaRiga[] }>("/economia/fatture").then((r) => r.fatture) });
export const useCanoni = () => useQuery({ queryKey: ["economia", "canoni"], queryFn: () => api<{ canoni: CanoneRiga[] }>("/economia/canoni").then((r) => r.canoni) });
export const useCosti = () => useQuery({ queryKey: ["economia", "costi"], queryFn: () => api<{ mesi: MeseCosti[] }>("/economia/costi").then((r) => r.mesi) });
export const useClienti = () => useQuery({ queryKey: ["clienti"], queryFn: () => api<{ clienti: ClienteRiga[] }>("/clients").then((r) => r.clienti) });
export const useCliente = (id: string) => useQuery({ queryKey: ["clienti", id], queryFn: () => api<SchedaClienteDati>(`/clients/${id}`) });
export const useAutomazioni = () => useQuery({ queryKey: ["automazioni"], queryFn: () => api<DatiPannello>("/automations") });
export const useAutomazione = (id: string) => useQuery({ queryKey: ["automazioni", id], queryFn: () => api<{ automazione: AutomazioneRiga }>(`/automations/${id}`).then((r) => r.automazione) });

// Dopo ogni scrittura si ricaricano Economia, Clienti, Automazioni e i badge: sono pochi dati e restano coerenti tra loro.
export function useRicarica() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["economia", "clienti", "automazioni", "badge"]) void qc.invalidateQueries({ queryKey: [k] });
  };
}

export const opzioniClienti = (clienti: ClienteRiga[], soloPerimetro: boolean): Opzione<string>[] =>
  clienti.filter((c) => !soloPerimetro || c.scope === "acceleriamo").map((c) => ({ valore: c.id, etichetta: c.name, meta: c.city ?? undefined }));
