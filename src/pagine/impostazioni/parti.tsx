import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../../api";
import { momento } from "../../format";
import type { Impostazioni, Integrazione, StatoSistema } from "../../types";

export const useImpostazioni = () => useQuery({ queryKey: ["settings"], queryFn: () => api<Impostazioni>("/settings") });
export const useStatoSistema = () => useQuery({ queryKey: ["integrazioni"], queryFn: () => api<StatoSistema>("/integrations/status"), refetchInterval: 60_000 });

// "spento" copre anche il segreto o il link mancante: si legge "Non collegato", mai come un errore.
export const COLORE = { ok: "verde", errore: "rosso", spento: "grigio", mai: "giallo" } as const;
export const ETICHETTA_STATO = { ok: "Funziona", errore: "Errore", spento: "Non collegato", mai: "Mai partito" } as const;

export function testoUltima(i: Integrazione, ora: number) {
  if (i.stato === "spento") return i.nota ?? "Non collegato";
  if (i.ultimaOk == null) return i.nota ?? "Non ha ancora lavorato";
  return `Ultima volta ${momento(i.ultimaOk, ora)}`;
}

export function Sezione({ titolo, id, coda, children }: { titolo: string; id?: string; coda?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={titolo} className="grid scroll-mt-20 gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-titolo-card">{titolo}</h2>
        {coda && <p className="text-secondaria text-grigio">{coda}</p>}
      </div>
      {children}
    </section>
  );
}

// Le voci di configurazione si aggiungono con un link in fondo alla lista (spec 11.3), mai con il "+".
export function Aggiungi({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 justify-self-start text-corpo font-semibold text-accento-testo underline-offset-4 hover:underline">
      {children}
    </button>
  );
}
