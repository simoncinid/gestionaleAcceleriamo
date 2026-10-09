import { CaretDown } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { api } from "../../api";
import { Chip, Contatto, Errore, Intestazione, Skeleton, StatoVuoto } from "../../ds";
import { momento } from "../../format";
import { useMe, useOra } from "../../hooks";
import type { Lead, Oggi as DatiOggi, RigaOggi as Riga } from "../../types";
import { BloccoAdesso } from "./BloccoAdesso";
import { useRitornoChiamata } from "./chiamata";
import { FoglioEsito } from "./FoglioEsito";
import { FoglioRimanda } from "./FoglioRimanda";
import { RigaLead, RigaProposta } from "./RigaOggi";

type LeadEsito = Pick<Riga, "id" | "company" | "contactName" | "stageId" | "attemptCount">;
const DATA = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });
const elenco = "divide-y divide-sabbia overflow-hidden rounded-blocco border border-sabbia bg-avorio";

// Gruppo aperto: titolo e numero sopra, righe in un solo blocco. Vuoto non si mostra.
function Gruppo({ titolo, n, children }: { titolo: string; n: number; children: ReactNode }) {
  const id = useId();
  if (n === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-titolo-card">{titolo}</h2>
        <span className="text-secondaria text-grigio tabular-nums">{n}</span>
      </header>
      {children}
    </section>
  );
}

// Gruppo a scomparsa (fermi, fine pausa): chiuso all'inizio, una riga con il conteggio.
function GruppoChiuso({ titolo, n, children }: { titolo: string; n: number; children: ReactNode }) {
  return (
    <details className="group rounded-blocco border border-sabbia bg-avorio">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-riga [&::-webkit-details-marker]:hidden">{titolo}
        <span className="ml-auto text-secondaria font-normal text-grigio tabular-nums">{n === 0 ? "nessuno" : `${n} lead`}</span>
        <CaretDown size={18} weight="bold" aria-hidden className="shrink-0 motion-safe:transition-transform group-open:rotate-180" />
      </summary>
      {n === 0
        ? <p className="border-t border-sabbia px-4 py-3 text-secondaria text-grigio">Nessun lead qui.</p>
        : <ul className="divide-y divide-sabbia border-t border-sabbia">{children}</ul>}
    </details>
  );
}

export function Oggi({ ora: oraFissa }: { ora?: number } = {}) {
  const [chi, setChi] = useState<"mie" | "tutte">("mie");
  const [esito, setEsito] = useState<LeadEsito | null>(null);
  const [rimanda, setRimanda] = useState<string | null>(null);
  const me = useMe();
  const q = useQuery({ queryKey: ["today", chi], queryFn: () => api<DatiOggi>(`/today?chi=${chi}`), refetchInterval: 60_000 });
  const ora = useOra(30_000, oraFissa);

  // Tornando dalla chiamata si apre il Foglio Esito del lead chiamato (spec 6.4, passo 2).
  useRitornoChiamata((id) => {
    const d = q.data;
    // Il lead in Adesso non si ripete nei gruppi: si cerca anche lì.
    const inAdesso = d?.adesso?.tipo === "lead" ? [d.adesso] : [];
    const l = d ? [...inAdesso, ...d.nuovi, ...d.daFare, ...d.fermi, ...d.finePausa].find((x) => x.id === id) : undefined;
    if (l) setEsito(l);
    else void api<{ lead: Lead }>(`/leads/${id}`).then((r) => setEsito(r.lead)).catch(() => undefined);
  });

  if (q.isLoading) return <Skeleton righe={6} />;
  if (q.error) return <Errore errore={q.error} onRiprova={() => void q.refetch()} />;
  const d = q.data!;
  const riga = (l: Riga) => <RigaLead key={l.id} l={l} ora={ora} onEsito={() => setEsito(l)} onRimanda={() => setRimanda(l.id)} />;
  // Con "Tutte" sul computer le azioni da fare stanno in due colonne: le mie e quelle dell'altro.
  const dueColonne = chi === "tutte" && me != null;
  const colonne: [string, Riga[]][] = [
    ["Mie", d.daFare.filter((l) => l.ownerId === me?.id)],
    ["Dell'altro", d.daFare.filter((l) => l.ownerId !== me?.id)],
  ];
  const adesso = d.adesso;

  return (
    <div className="flex flex-col gap-2 pb-8">
      <Intestazione titolo="Oggi" numero={d.totale} coda="da fare" eyebrow={DATA.format(ora)} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            {adesso ? (
              <BloccoAdesso voce={adesso} ora={ora}
                onEsito={() => adesso.tipo === "lead" && setEsito(adesso)}
                onRimanda={() => adesso.tipo === "lead" && setRimanda(adesso.id)} />
            ) : (
              <StatoVuoto titolo="Niente da fare adesso" testo="Quando arriva un lead o scade un'azione, compare qui." />
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-secondaria text-grigio">Di chi</span>
              <div className="flex gap-2" role="group" aria-label="Di chi">
                <Chip selezionato={chi === "mie"} onClick={() => setChi("mie")}>Mie</Chip>
                <Chip selezionato={chi === "tutte"} onClick={() => setChi("tutte")}>Tutte</Chip>
              </div>
            </div>
          </div>
          <Gruppo titolo="Lead nuovi da chiamare" n={d.nuovi.length}>
            <ul className={elenco}>{d.nuovi.map(riga)}</ul>
          </Gruppo>
          <Gruppo titolo="Da fare" n={d.daFare.length}>
            <ul className={dueColonne ? `${elenco} md:hidden` : elenco}>{d.daFare.map(riga)}</ul>
            {dueColonne && (
              <div className="hidden gap-4 md:grid md:grid-cols-2 md:items-start">
                {colonne.map(([t, righe]) => (
                  <div key={t} className="flex flex-col gap-2">
                    <p className="text-secondaria font-semibold">{t}</p>
                    {righe.length ? <ul className={elenco}>{righe.map(riga)}</ul> : <p className="text-secondaria text-grigio">Niente qui.</p>}
                  </div>
                ))}
              </div>
            )}
          </Gruppo>
          <Gruppo titolo="Call di oggi" n={d.call.length}>
            <ul className={elenco}>
              {d.call.map((k) => (
                <li key={k.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-numero text-accento-testo tabular-nums">{momento(k.scheduledAt, ora)}</span>
                    <span className="text-riga">{k.company}</span>
                    <span className="text-secondaria text-grigio">Call di {k.kind}</span>
                  </div>
                  <div className="flex"><Contatto tipo="meet" lead={k} variante="icona" /></div>
                </li>
              ))}
            </ul>
          </Gruppo>
        </div>
        <div className="flex flex-col gap-8">
          <Gruppo titolo="Proposte da seguire oggi" n={d.proposte.length}>
            <ul className={elenco}>{d.proposte.map((p) => <RigaProposta key={p.id} p={p} ora={ora} />)}</ul>
          </Gruppo>
          <div className="flex flex-col gap-3">
            <GruppoChiuso titolo="Fermi da 7 giorni" n={d.fermi.length}>{d.fermi.map(riga)}</GruppoChiuso>
            <GruppoChiuso titolo="Fine pausa" n={d.finePausa.length}>{d.finePausa.map(riga)}</GruppoChiuso>
          </div>
          <section aria-label="Numeri del giorno" className="flex flex-col gap-3">
            <h2 className="font-display text-titolo-card">Numeri del giorno</h2>
            <div className={`${elenco} text-corpo tabular-nums [&>p]:px-4 [&>p]:py-3`}>
              <p>Lead nuovi oggi: {d.numeri.leadNuovi}</p>
              <p>Prima risposta media: {d.numeri.primaRispostaMinuti == null ? "nessun dato" : `${d.numeri.primaRispostaMinuti} min`}</p>
              <p>Call questa settimana: {d.numeri.callSettimana}</p>
              <p>Proposte aperte: {d.numeri.proposteAperte}</p>
            </div>
          </section>
        </div>
      </div>
      {esito && <FoglioEsito lead={esito} onChiudi={() => setEsito(null)} />}
      {rimanda && <FoglioRimanda leadId={rimanda} onChiudi={() => setRimanda(null)} />}
    </div>
  );
}
