import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../api";
import { Empty, cx } from "../components/ui";
import { SOURCE_LABELS, dayBounds, fmtDate, fmtDateTime, relative } from "../format";
import type { Today, TodayItem } from "../types";

type SectionDef = { key: keyof Today; title: string; hint?: string; empty?: string; line: (i: TodayItem) => string };

const SECTIONS: SectionDef[] = [
  { key: "due", title: "da fare", hint: "Azioni scadute o in scadenza oggi", empty: "Niente in scadenza oggi.", line: (i) => `${i.nextAction ?? ""} · ${fmtDateTime(i.nextActionAt)}` },
  { key: "appointments", title: "call di oggi", empty: "Nessuna call oggi.", line: (i) => fmtDateTime(i.appointmentAt) },
  { key: "untouched", title: "nuovi, mai toccati", hint: "Nessuna chiamata, nota o email ancora", line: (i) => [SOURCE_LABELS[i.source] ?? i.source, i.metaCampaign].filter(Boolean).join(" · ") },
  { key: "stale", title: "fermi da più di 7 giorni", line: (i) => `${i.stageLabel}, ultimo cambio ${relative(i.stageChangedAt)}` },
  { key: "missingAction", title: "senza prossima azione", line: (i) => i.stageLabel },
  { key: "metaIncomplete", title: "dati meta da recuperare", hint: "Riprovo da solo ogni 15 minuti", line: () => "In attesa dei dati da Meta" },
];

export function Oggi() {
  const day = dayBounds();
  const today = useQuery({
    queryKey: ["today", day.from],
    queryFn: async () => {
      const bounds = dayBounds();
      const data = await api<Today>(`/today?from=${bounds.from}&until=${bounds.until}&now=${bounds.now}`);
      return { bounds, data };
    },
    refetchInterval: 60_000,
  });
  if (today.isLoading) return <p className="text-ink/60">Caricamento…</p>;
  if (today.error || !today.data) return <Empty text={today.error?.message ?? "Errore"} />;
  const { data, bounds } = today.data;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-4xl lowercase">oggi</h1>
        <p className="text-ink/60">{fmtDate(bounds.now)}</p>
      </header>
      {SECTIONS.map((s) => {
        const items = data[s.key];
        if (!items.length && !s.empty) return null;
        return (
          <section key={s.key}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-2xl lowercase">{s.title}</h2>
              <span className="text-sm text-ink/50">{items.length}</span>
              {s.hint && <span className="text-xs text-ink/40">{s.hint}</span>}
            </div>
            {items.length ? (
              <ul className="divide-y divide-ink/5 rounded-xl bg-white ring-1 ring-ink/5">
                {items.map((i) => {
                  const late = s.key === "due" && i.nextActionAt != null && i.nextActionAt < bounds.from;
                  return (
                    <li key={i.id}>
                      <Link to={`/lead/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-cream">
                        <span>
                          <span className="font-medium">{i.company}</span>
                          {i.contactName && <span className="text-ink/50"> · {i.contactName}</span>}
                        </span>
                        <span className={cx("text-sm", late ? "font-medium text-red-700" : "text-ink/60")}>{late ? "Scaduta: " : ""}{s.line(i)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty text={s.empty!} />
            )}
          </section>
        );
      })}
    </div>
  );
}
