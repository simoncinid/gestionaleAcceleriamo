import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { Card, Empty, Select } from "../components/ui";
import { SOURCE_LABELS, fmtDuration } from "../format";
import type { Stats } from "../types";

const PERIODS = [
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 90 giorni" },
  { value: "all", label: "Da sempre" },
];

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "0%");

export function Numeri() {
  const [period, setPeriod] = useState("30");
  const from = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
  const stats = useQuery({ queryKey: ["stats", period], queryFn: () => api<Stats>(`/stats?from=${Math.floor(from / 60_000) * 60_000}`) });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl lowercase">numeri</h1>
        <Select className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periodo">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
      </header>
      {stats.error && <Empty text={stats.error.message} />}
      {stats.data && (
        <>
          <Card title="tempo di prima risposta">
            <p className="text-3xl font-medium">{fmtDuration(stats.data.firstResponse.avgMs)}</p>
            <p className="text-sm text-ink/50">Media su {stats.data.firstResponse.count} lead, dall'arrivo alla prima chiamata, nota, email o cambio di fase.</p>
          </Card>
          <Card title="per fonte">
            <Table head={["Fonte", "Lead", "Chiusi", "Persi", "% chiusi"]} rows={stats.data.bySource.map((r) => [SOURCE_LABELS[r.source] ?? r.source, r.total, r.won, r.lost, pct(r.won, r.total)])} />
          </Card>
          <Card title="per campagna meta">
            <Table head={["Campagna", "Lead", "Chiusi", "Persi", "% chiusi"]} rows={stats.data.byCampaign.map((r) => [r.campaign, r.total, r.won, r.lost, pct(r.won, r.total)])} />
          </Card>
          <Card title="per fase">
            <Table head={["Fase", "Lead"]} rows={stats.data.byStage.map((r) => [r.label, r.count])} />
          </Card>
        </>
      )}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-sm text-ink/50">Ancora nessun dato.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-ink/50">
          <tr>{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
