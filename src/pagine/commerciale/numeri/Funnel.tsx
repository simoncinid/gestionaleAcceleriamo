import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../api";
import { Chip, Errore, Skeleton, StatoVuoto } from "../../../ds";
import { percentualeOppureNd } from "../../../format";
import type { Funnel as FunnelDati } from "../../../types";
import { Gruppo, Voce } from "./righe";

const PERIODI = [["30", "30 giorni"], ["90", "90 giorni"], ["all", "Da sempre"]] as const;
type Periodo = (typeof PERIODI)[number][0];

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
// Durata leggibile: minuti fino a un'ora e mezza, poi ore, oltre due giorni in giorni.
export function durata(ms: number): string {
  if (ms < 90 * MINUTO) return `${Math.round(ms / MINUTO)} min`;
  if (ms < 48 * ORA) return `${(Math.round((ms / ORA) * 10) / 10).toLocaleString("it-IT")} ore`;
  return `${(Math.round((ms / (24 * ORA)) * 10) / 10).toLocaleString("it-IT")} giorni`;
}
const giorni = (g: number) => `${g.toLocaleString("it-IT")} ${g === 1 ? "giorno" : "giorni"}`;
const passaggi = (n: number) => `media su ${n} ${n === 1 ? "passaggio" : "passaggi"}`;

export function Funnel({ ora = Date.now() }: { ora?: number }) {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const da = periodo === "all" ? 0 : Math.floor((ora - Number(periodo) * 86_400_000) / MINUTO) * MINUTO;
  const q = useQuery({ queryKey: ["numeri", "funnel", periodo], queryFn: () => api<FunnelDati>(`/numeri/funnel?from=${da}`) });
  const f = q.data;
  const nomePeriodo = PERIODI.find((p) => p[0] === periodo)?.[1];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
        {PERIODI.map(([v, t]) => <Chip key={v} selezionato={v === periodo} onClick={() => setPeriodo(v)}>{t}</Chip>)}
      </div>
      {q.isLoading ? <Skeleton righe={6} /> : q.error || !f ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : f.tappe[0].numero === 0 ? (
        <StatoVuoto titolo="Nessun lead nel periodo" testo="Scegli un periodo più lungo per vedere i numeri." />
      ) : (
        // Computer largo: il funnel a sinistra (la barra di ogni tappa è già il grafico), tempi, call e motivi a destra.
        <div className="grid items-start gap-6 @5xl:grid-cols-12 @5xl:gap-8">
          <div className="flex flex-col gap-6 @5xl:col-span-7 @7xl:col-span-6">
          <Gruppo titolo="Dal lead al cliente" meta={nomePeriodo}>
            {f.tappe.map((t) => t.chiave === "arrivati" ? (
              <Voce key={t.chiave} nome={t.nome} numero={t.numero} />
            ) : t.chiave === "sla" ? (
              <Voce key={t.chiave} nome={t.nome} numero={`${f.sla.dentro} su ${f.sla.totale}`} dettaglio={`${percentualeOppureNd(f.sla.percentuale)} dei lead da Meta e dal foglio`} quota={f.sla.percentuale} />
            ) : (
              <Voce key={t.chiave} nome={t.nome} numero={t.numero} dettaglio={`${percentualeOppureNd(t.percentuale)} degli arrivati`} quota={t.percentuale} />
            ))}
          </Gruppo>
          </div>
          <div className="grid items-start gap-6 @5xl:col-span-5 @7xl:col-span-6 @7xl:grid-cols-2 @7xl:gap-8">
          <div className="flex flex-col gap-6">
          <Gruppo titolo="Tempi" nota="Tempi dei lead arrivati nel periodo, compresi i passaggi avvenuti dopo.">
            <Voce
              nome="Prima risposta media"
              numero={f.primaRisposta.mediaMs == null ? "n.d." : durata(f.primaRisposta.mediaMs)}
              dettaglio={`su ${f.primaRisposta.numero} lead da Meta e dal foglio`}
            />
            {f.tempi.map((t) => <Voce key={t.stageId} nome={`In "${t.label}"`} numero={giorni(t.giorniMedi)} dettaglio={passaggi(t.passaggi)} />)}
          </Gruppo>
          <Gruppo titolo="Call">
            <Voce nome="Call di conoscenza fatte" numero={f.call.conoscenza} />
            <Voce nome="Call dell'offerta fatte" numero={f.call.offerta} />
            <Voce nome="Call di analisi fatte" numero={f.call.analisi} />
            <Voce nome="Call del progetto fatte" numero={f.call.progetto} />
            <Voce nome="Dalla conoscenza all'offerta" numero={percentualeOppureNd(f.call.rapporto)} quota={f.call.rapporto} />
          </Gruppo>
          </div>
          <div className="flex flex-col gap-6">
          {f.motivi.length > 0 && (
            <Gruppo titolo="Motivi di perdita">
              {f.motivi.map((m) => <Voce key={m.id} nome={m.etichetta} numero={m.numero} quota={(m.numero / Math.max(...f.motivi.map((x) => x.numero), 1)) * 100} />)}
            </Gruppo>
          )}
          <p className="text-nota text-grigio">Le percentuali con meno di 5 lead non si calcolano: scrivono "n.d.". I doppioni non si contano.</p>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
