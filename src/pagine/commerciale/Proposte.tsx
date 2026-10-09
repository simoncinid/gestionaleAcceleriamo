import { useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Riga, Skeleton, StatoVuoto } from "../../ds";
import { euro, quando } from "../../format";
import { useOra } from "../../hooks";
import type { PropostaRiga } from "../../types";
import { FoglioAbbina } from "./FoglioProposta";

const APERTE: readonly string[] = ["bozza", "registrata", "presentata"];
const MESE = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" });
export const STATI: Record<PropostaRiga["status"], string> = { bozza: "Bozza", registrata: "Registrata", presentata: "Presentata", accettata: "Accettata", rifiutata: "Rifiutata", scaduta: "Scaduta" };

// Setup e canone stanno sulla stessa riga (spec 6.8): è l'unica eccezione a "un'informazione per riga".
export const prezzo = (p: Pick<PropostaRiga, "setupCents" | "feeCents" | "option">) =>
  p.option === "proprieta" ? `Setup ${euro(p.setupCents ?? 0)}, proprietà del codice` : `Setup ${euro(p.setupCents ?? 0)}, canone ${euro(p.feeCents ?? 0)}`;

// Cosa succede adesso alla proposta, in una riga.
function stadio(p: PropostaRiga, ora: number) {
  if (p.status === "presentata") return p.nextActionAt != null ? `Follow-up ${quando(p.nextActionAt, ora)}` : "Presentata";
  if (p.status === "registrata") return "Da presentare in call";
  if (p.status === "bozza") return "Bozza, da mandare";
  return STATI[p.status];
}

// Titolo a sinistra, numero a destra, righe sotto (come i giorni di Call).
function Gruppo({ titolo, righe, children }: { titolo: string; righe: number; children: ReactNode }) {
  const id = useId();
  if (!righe) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-titolo-card">{titolo}</h2>
        <span className="text-secondaria text-grigio tabular-nums">{righe}</span>
      </header>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

export function Proposte({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useQuery({ queryKey: ["proposte"], queryFn: () => api<{ proposte: PropostaRiga[] }>("/proposals").then((r) => r.proposte) });
  const [abbina, setAbbina] = useState<PropostaRiga | null>(null);
  const intestazione = (n?: number) => <Intestazione titolo="Proposte" numero={n} coda="aperte" eyebrow={MESE.format(ora)} />;
  if (q.isLoading) return <div className="mx-auto max-w-[1100px] p-4">{intestazione()}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="mx-auto max-w-[1100px] p-4">{intestazione()}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;

  const tutte = q.data ?? [];
  const daAbbinare = tutte.filter((p) => !p.leadId && APERTE.includes(p.status));
  const abbinate = tutte.filter((p) => p.leadId);
  const di = (s: PropostaRiga["status"]) => abbinate.filter((p) => p.status === s);
  const chiuse = tutte.filter((p) => !APERTE.includes(p.status));
  const riga = (p: PropostaRiga) => (
    <li key={p.id}><Riga href={`/commerciale/proposte/${p.id}`} titolo={p.company || p.number} secondaria={prezzo(p)} meta={stadio(p, ora)} /></li>
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-4">
      {intestazione(tutte.filter((p) => APERTE.includes(p.status)).length)}
      {tutte.length === 0 && <StatoVuoto titolo="Nessuna proposta" testo="Arrivano dal wiki quando stampi un preventivo, oppure dal +." />}

      {daAbbinare.length > 0 && (
        <Gruppo titolo="Da abbinare" righe={daAbbinare.length}>
          {daAbbinare.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-blocco bg-sabbia px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-corpo font-semibold">{p.company ? `${p.number}, ${p.company}` : p.number}</p>
                <p className="truncate text-secondaria text-grigio tabular-nums">{prezzo(p)}</p>
                <p className="text-meta text-grigio">Nessun lead con questo nome</p>
              </div>
              <Pulsante variante="secondario" className="shrink-0" onClick={() => setAbbina(p)}>Abbina a un lead</Pulsante>
            </li>
          ))}
        </Gruppo>
      )}

      <Gruppo titolo="Bozze" righe={di("bozza").length}>{di("bozza").map(riga)}</Gruppo>
      <Gruppo titolo="Registrate, da presentare" righe={di("registrata").length}>{di("registrata").map(riga)}</Gruppo>
      <Gruppo titolo="Presentate" righe={di("presentata").length}>{di("presentata").map(riga)}</Gruppo>

      {chiuse.length > 0 && (
        <details className="group border-t border-sabbia pt-3">
          <summary className="flex cursor-pointer items-baseline justify-between gap-3 py-2 font-display text-titolo-card">Chiuse <span className="font-sans text-secondaria text-grigio tabular-nums">{chiuse.length}</span></summary>
          <ul className="flex flex-col gap-2 pt-2">{chiuse.map(riga)}</ul>
        </details>
      )}

      {abbina && <FoglioAbbina proposta={abbina} onChiudi={() => setAbbina(null)} />}
    </div>
  );
}
