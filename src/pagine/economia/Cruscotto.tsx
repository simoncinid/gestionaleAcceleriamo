import { useState, type ReactNode } from "react";
import { meseRoma } from "../../../worker/lib/roma";
import { Errore, Intestazione, Pulsante, Riga, Skeleton } from "../../ds";
import { euro, giorno, nomeMese } from "../../format";
import { useOra } from "../../hooks";
import type { FatturaRiga } from "../../types";
import { useCruscotto } from "../dati-gestione";
import { Sezione } from "../impostazioni/parti";
import { FoglioFattura } from "./Fogli";

const Carta = ({ children, tinta = false }: { children: ReactNode; tinta?: boolean }) => (
  <div className={`grid gap-1 rounded-blocco border border-sabbia p-5 ${tinta ? "bg-tinta-2" : "bg-avorio"}`}>{children}</div>
);

// Spec 9.1: "quanto ricorrente abbiamo, e chi deve pagare". Primario solo se c'è una fattura in ritardo.
export function Cruscotto({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useCruscotto();
  const [aperta, setAperta] = useState<FatturaRiga | null>(null);
  const intestazione = (ricorrente?: number) => <Intestazione titolo="Economia" numero={ricorrente != null ? euro(ricorrente) : undefined} coda="al mese" eyebrow={nomeMese(meseRoma(ora))} />;
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4">{intestazione()}<Skeleton righe={6} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4">{intestazione()}<Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const d = q.data!;
  const quota = Math.min(100, Math.round((d.ricorrenteCents / Math.max(1, d.obiettivoCents)) * 100));
  const mancano = d.obiettivoCents - d.ricorrenteCents;
  const [prima, ...altre] = d.inRitardo;
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4">
      {intestazione(d.ricorrenteCents)}
      {prima && (
        <Sezione titolo="Da fare" coda={d.inRitardo.length > 1 ? `${d.inRitardo.length} in ritardo` : undefined}>
          <Carta tinta>
            <p className="text-etichetta uppercase text-grigio">Da incassare, in ritardo</p>
            <p className="text-corpo font-semibold">{prima.cliente}</p>
            <p className="text-secondaria tabular-nums">{euro(prima.amountCents)}</p>
            {prima.number && <p className="text-secondaria text-grigio">{`Fattura n. ${prima.number}`}</p>}
            <p className="text-meta font-semibold text-errore">{`Scaduta il ${giorno(prima.dueAt!, ora)}`}</p>
            <Pulsante variante="primario" misura="lg" className="mt-3 w-full sm:w-auto sm:justify-self-start" onClick={() => setAperta(prima)}>Segna incassata</Pulsante>
          </Carta>
          {altre.length > 0 && (
            <ul className="grid gap-2">
              {altre.map((f) => (
                <li key={f.id}><Riga titolo={f.cliente} secondaria={euro(f.amountCents)} meta={`Scaduta il ${giorno(f.dueAt!, ora)}`} onClick={() => setAperta(f)} /></li>
              ))}
            </ul>
          )}
        </Sezione>
      )}
      <Sezione titolo="Ricorrente">
        <Carta>
          <p className="font-display text-titolo-blocco tabular-nums">{euro(d.ricorrenteCents)}</p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-sabbia" role="progressbar" aria-label="Ricorrente contro l'obiettivo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quota}>
            <div className="h-full rounded-full bg-accento" style={{ width: `${quota}%` }} />
          </div>
          <p className="mt-2 text-secondaria text-grigio tabular-nums">{`${euro(d.ricorrenteCents)} di ${euro(d.obiettivoCents)}`}</p>
          <p className="text-secondaria text-grigio tabular-nums">{mancano > 0 ? `Mancano ${euro(mancano)} all'obiettivo` : "Obiettivo raggiunto"}</p>
        </Carta>
      </Sezione>
      <Sezione titolo="Setup incassati">
        <Carta>
          <p className="text-corpo tabular-nums">{`Nel mese: ${euro(d.setupMeseCents)}`}</p>
          <p className="text-corpo tabular-nums">{`Nell'anno: ${euro(d.setupAnnoCents)}`}</p>
        </Carta>
      </Sezione>
      <Sezione titolo="Da incassare">
        <Riga titolo={euro(d.daIncassareCents)} secondaria="Fatture emesse e non incassate" href="/economia/fatture" />
      </Sezione>
      <Sezione titolo="Costi del mese">
        <Riga titolo={euro(d.costiMeseCents)} secondaria="Vedi i costi" href="/economia/costi" />
      </Sezione>
      {aperta && <FoglioFattura f={aperta} ora={ora} onChiudi={() => setAperta(null)} />}
    </div>
  );
}
