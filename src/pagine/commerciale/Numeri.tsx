import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { Chip, Errore, Intestazione, Skeleton, StatoVuoto } from "../../ds";
import { SOURCE_LABELS, percentuale } from "../../format";
import type { Stats } from "../../types";

const PERIODI = [["30", "30 giorni"], ["90", "90 giorni"], ["all", "Da sempre"]] as const;
type Periodo = (typeof PERIODI)[number][0];

// Un gruppo di righe in un blocco avorio, con il titolo sopra (come nel prototipo, schermata 19).
function Gruppo({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-titolo-blocco">{titolo}</h2>
      <ul className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">{children}</ul>
    </section>
  );
}

// Riga: nome a sinistra, numero a destra, dettaglio sotto il nome.
function Voce({ nome, numero, dettaglio }: { nome: string; numero: string | number; dettaglio?: string }) {
  return (
    <li className="flex min-h-14 items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-corpo">{nome}</span>
        {dettaglio && <span className="text-secondaria text-grigio tabular-nums">{dettaglio}</span>}
      </div>
      <span className="shrink-0 text-corpo font-semibold tabular-nums">{numero}</span>
    </li>
  );
}

const dettaglio = (r: { total: number; won: number; lost: number }) => `${r.total} lead, ${r.won} chiusi, ${r.lost} persi`;

// Numeri della 1A nel nuovo stile. Funnel, campagne e previsione arrivano col Piano B.
export function Numeri() {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const da = periodo === "all" ? 0 : Math.floor((Date.now() - Number(periodo) * 86_400_000) / 60_000) * 60_000;
  const s = useQuery({ queryKey: ["stats", periodo], queryFn: () => api<Stats>(`/stats?from=${da}`) });
  const minuti = s.data?.firstResponse.avgMs == null ? null : Math.round(s.data.firstResponse.avgMs / 60_000);
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-4">
      <Intestazione titolo="Numeri">
        <div className="flex gap-2 pt-3" role="group" aria-label="Periodo">
          {PERIODI.map(([v, t]) => <Chip key={v} selezionato={v === periodo} onClick={() => setPeriodo(v)}>{t}</Chip>)}
        </div>
      </Intestazione>
      {s.isLoading ? <Skeleton righe={6} /> : s.error || !s.data ? <Errore errore={s.error} onRiprova={() => void s.refetch()} /> : s.data.bySource.length === 0 ? (
        <StatoVuoto titolo="Ancora nessun lead nel periodo" testo="Scegli un periodo più lungo per vedere i numeri." />
      ) : (
        <>
          <Gruppo titolo="Tempi">
            <Voce nome="Prima risposta media" numero={minuti == null ? "n.d." : `${minuti} min`} dettaglio={`su ${s.data.firstResponse.count} lead`} />
          </Gruppo>
          <Gruppo titolo="Per fonte">
            {s.data.bySource.map((r) => <Voce key={r.source} nome={SOURCE_LABELS[r.source] ?? r.source} numero={percentuale(r.won, r.total)} dettaglio={dettaglio(r)} />)}
          </Gruppo>
          {s.data.byCampaign.length > 0 && (
            <Gruppo titolo="Per campagna">
              {s.data.byCampaign.map((r) => <Voce key={r.campaign} nome={r.campaign} numero={percentuale(r.won, r.total)} dettaglio={dettaglio(r)} />)}
            </Gruppo>
          )}
          <Gruppo titolo="Per fase">
            {s.data.byStage.map((r) => <Voce key={r.stageId} nome={r.label} numero={r.count} />)}
          </Gruppo>
          <p className="text-meta text-grigio">La percentuale è chiusi su lead arrivati; con meno di 5 lead non si calcola.</p>
        </>
      )}
    </div>
  );
}
