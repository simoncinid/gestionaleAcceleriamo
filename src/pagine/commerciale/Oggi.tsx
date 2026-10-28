import { ArrowRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../api";
import { Errore, Skeleton, StatoVuoto, cx } from "../../ds";
import { useMe, useOra, useStages } from "../../hooks";
import { inizioGiornoRoma, partiRoma } from "../../../worker/lib/roma";
import type { Comando, Lead, Oggi as DatiOggi, RigaOggi } from "../../types";
import { useRitornoChiamata } from "./chiamata";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioFissaCall } from "./FoglioFissaCall";
import { FoglioRimanda } from "./FoglioRimanda";
import { CALL_DEL_CODICE, CALL_DELL_FASE } from "../../../worker/regole/fasi-call";
import { RigaDaFare, type Apertura } from "./RigaOggi";
import { faseDi } from "./EtichettaFase";
import { useTask } from "../lavori/dati";
import { RigaTask } from "../lavori/RigaTask";

// Oggi (contratto blocco 1, sezione 5): una lista sola, "Da fare oggi", per il responsabile scelto. Scaduti dal più
// vecchio, poi quelli di oggi per ora. Sotto, due blocchi piccoli: Call di oggi e Lavori. Il numero del titolo è il
// numero delle righe, lo stesso del badge del Commerciale e della tabella filtrata (stessa funzione nel worker).

type Chi = "mie" | "tutte";
type LeadEsito = { id: string; company: string; contactName: string | null; stageId: string; attemptCount: number; email?: string | null };
type Aperto = { tipo: Apertura; lead: RigaOggi; comando: Comando } | { tipo: "esito"; lead: LeadEsito; comando?: undefined };

const DATA = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
const contenitore = "overflow-hidden rounded-[10px] border border-[#E5DED4] bg-avorio";
// Nella lista delle call di oggi basta l'ora: il giorno è già nel titolo.
const orario = (ms: number) => { const p = partiRoma(ms); return `${String(p.ore).padStart(2, "0")}:${String(p.minuti).padStart(2, "0")}`; };
const SEGMENTI: { id: Chi; etichetta: string }[] = [{ id: "mie", etichetta: "Miei" }, { id: "tutte", etichetta: "Tutti" }];

export const titoloOggi = (n: number) => (n === 0 ? "Oggi, niente da fare" : `Oggi, ${n} da fare`);

function Blocco({ titolo, coda, children }: { titolo: string; coda?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={contenitore}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[#EFE9E1] px-4 py-2">
        <h2 id={id} className="font-sans text-[17px] font-semibold leading-6">{titolo}</h2>
        {coda}
      </header>
      {children}
    </section>
  );
}

export function Oggi({ ora: oraFissa }: { ora?: number } = {}) {
  const [chi, setChi] = useState<Chi>("mie");
  const [aperto, setAperto] = useState<Aperto | null>(null);
  const me = useMe();
  const fasi = useStages();
  const q = useQuery({ queryKey: ["today", chi], queryFn: () => api<DatiOggi>(`/today?chi=${chi}`), refetchInterval: 60_000 });
  const ora = useOra(30_000, oraFissa);
  const lavori = useTask(chi);

  // Tornando dalla chiamata si apre il Foglio Esito del lead chiamato (spec 6.4, passo 2).
  useRitornoChiamata((id) => {
    const l = q.data?.righe.find((x) => x.id === id);
    if (l) setAperto({ tipo: "esito", lead: l });
    else void api<{ lead: Lead }>(`/leads/${id}`).then((r) => setAperto({ tipo: "esito", lead: r.lead })).catch(() => undefined);
  });

  const testata = (n: number | null) => (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] text-grigio first-letter:uppercase">{DATA.format(ora)}</p>
        <h1 className="font-sans text-[24px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums md:text-[28px]">{n == null ? "Oggi" : titoloOggi(n)}</h1>
      </div>
      <div role="group" aria-label="Di chi" className="flex shrink-0 rounded-controllo border-[1.5px] border-sabbia-2 bg-avorio p-0.5 md:h-11">
        {SEGMENTI.map((s) => (
          <button key={s.id} type="button" aria-pressed={chi === s.id} onClick={() => setChi(s.id)}
            className={cx("h-11 flex-1 rounded-[9px] px-5 md:h-auto text-secondaria font-medium transition-colors duration-(--durata-veloce) md:flex-none",
              chi === s.id ? "bg-ink text-avorio" : "text-ink hover:bg-crema")}>
            {s.etichetta}
          </button>
        ))}
      </div>
    </header>
  );

  if (q.isLoading) return <div className="flex flex-col gap-6 pb-8">{testata(null)}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="flex flex-col gap-6 pb-8">{testata(null)}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const d = q.data!;
  // La stessa vista nella tabella: scaduti più oggi, stesso responsabile.
  const tabella = `/commerciale/lead?scad=oggi${chi === "mie" && me ? `&resp=${encodeURIComponent(me.id)}` : ""}`;
  const domani = inizioGiornoRoma(ora + 36 * 3_600_000);
  const lavoriOggi = (lavori.data ?? []).filter((t) => t.dueAt != null && t.dueAt < domani);
  const apri = (tipo: Apertura, lead: RigaOggi, comando: Comando) => setAperto({ tipo, lead, comando });
  const chiudi = () => setAperto(null);

  return (
    <div className="flex flex-col gap-6 pb-8">
      {testata(d.totale)}

      <Blocco titolo="Da fare oggi" coda={
        <Link to={tabella} className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-ink hover:bg-crema">
          Apri nella tabella <ArrowRight size={14} weight="bold" aria-hidden />
        </Link>
      }>
        {d.righe.length === 0 ? (
          <div className="p-4">
            <StatoVuoto titolo="Niente da fare oggi" testo={chi === "mie" ? "Le tue azioni scadute o di oggi compaiono qui." : "Le azioni scadute o di oggi della squadra compaiono qui."} />
          </div>
        ) : (
          <ul aria-label="Da fare oggi" className="divide-y divide-[#EFE9E1]">
            {d.righe.map((l, i) => <RigaDaFare key={l.id} l={l} ora={ora} fase={faseDi(fasi.data, l.stageId)} primaria={i === 0} onApri={(a, c) => apri(a, l, c)} />)}
          </ul>
        )}
      </Blocco>

      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2 @4xl:items-start">
        {d.call.length > 0 && (
          <Blocco titolo="Call di oggi">
            <ul className="divide-y divide-[#EFE9E1]">
              {d.call.map((k) => (
                <li key={k.id}>
                  <Link to={`/commerciale/call/${k.id}`} className="flex min-h-14 items-center gap-4 px-4 py-2.5 hover:bg-crema">
                    <span className="w-12 shrink-0 text-[15px] font-semibold tabular-nums">{orario(k.scheduledAt)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px]">{k.company}</span>
                      <span className="truncate text-[13px] text-grigio">
                        Call di {k.kind}{k.kind === "conoscenza" && k.scheda ? `, ${k.scheda === "pronta" ? "scheda azienda pronta" : "scheda in preparazione"}` : ""}
                      </span>
                    </span>
                    <ArrowRight size={16} weight="bold" aria-hidden className="shrink-0 text-grigio" />
                  </Link>
                </li>
              ))}
            </ul>
          </Blocco>
        )}
        {lavoriOggi.length > 0 && (
          <Blocco titolo="Lavori">
            <ul className="divide-y divide-[#EFE9E1]">{lavoriOggi.map((t) => <RigaTask key={t.id} t={t} ora={ora} />)}</ul>
          </Blocco>
        )}
      </div>

      {aperto?.tipo === "esito" && <FoglioEsito lead={aperto.lead} onChiudi={chiudi} />}
      {aperto?.tipo === "rimanda" && <FoglioRimanda leadId={aperto.lead.id} onChiudi={chiudi} />}
      {aperto?.tipo === "fissa" && (() => {
        // Fissare una call sposta anche il lead nella sua fase (come dalla scheda): il tipo viene dal codice, senza ricalcoli.
        const kind = CALL_DEL_CODICE[aperto.comando?.codice ?? ""] ?? "conoscenza";
        const label = fasi.data?.find((f) => f.id === CALL_DELL_FASE[kind])?.label;
        return <FoglioFissaCall leadId={aperto.lead.id} haEmail={!!(aperto.lead as RigaOggi).email} onChiudi={chiudi} fase={label ? { label, kind } : undefined} />;
      })()}
    </div>
  );
}
