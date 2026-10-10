import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../../api";
import { euroCentesimi, momento } from "../../format";
import { partiRoma } from "../../../worker/lib/roma";
import type { Impostazioni, Integrazione, Profilo, StatoSistema } from "../../types";

export const useImpostazioni = () => useQuery({ queryKey: ["settings"], queryFn: () => api<Impostazioni>("/settings") });
export const useStatoSistema = () => useQuery({ queryKey: ["integrazioni"], queryFn: () => api<StatoSistema>("/integrations/status"), refetchInterval: 60_000 });

// "spento" copre anche il segreto o il link mancante: si legge "Non collegato", mai come un errore.
export const COLORE = { ok: "verde", errore: "rosso", spento: "grigio", mai: "giallo" } as const;
export const ETICHETTA_STATO = { ok: "Funziona", errore: "Errore", spento: "Non collegato", mai: "Mai partito" } as const;

// Il giro parte ogni 5 minuti: se l'ultimo riuscito ha più di 20 minuti il cron è fermo, e va segnato.
const GIRO_FERMO_MS = 20 * 60_000;
export function conGiroInRitardo(integrazioni: Integrazione[], ora: number): Integrazione[] {
  return integrazioni.map((i) => {
    if (i.key !== "giro" || i.stato !== "ok" || i.ultimaOk == null || ora - i.ultimaOk <= GIRO_FERMO_MS) return i;
    const p = partiRoma(i.ultimaOk);
    const hhmm = `${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`;
    return { ...i, stato: "errore", nota: `Ultimo giro alle ${hhmm}, atteso ogni 5 minuti` };
  });
}

export function testoUltima(i: Integrazione, ora: number) {
  if (i.stato === "spento") return i.nota ?? "Non collegato";
  if (i.ultimaOk == null) return i.nota ?? "Non ha ancora lavorato";
  return `Ultima volta ${momento(i.ultimaOk, ora)}`;
}

export const useProfilo = () => useQuery({ queryKey: ["me", "profilo"], queryFn: () => api<Profilo>("/me/profilo") });

// Una riga sola per voce: spenta o rotta dice perché; Claude dice speso e tetto del mese (Task 6, campo extra).
export function rigaStato(i: Integrazione, ora: number) {
  if (i.stato === "errore" || i.stato === "spento") return i.nota ?? ETICHETTA_STATO[i.stato];
  if (i.key === "claude" && i.extra?.tettoCents) return `${euroCentesimi(i.extra.spesoCents)} su ${euroCentesimi(i.extra.tettoCents)} questo mese`;
  return testoUltima(i, ora);
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
