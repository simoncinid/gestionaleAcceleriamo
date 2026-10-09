import { useState } from "react";
import { ETICHETTE_FATTURA, ETICHETTE_TIPO_FATTURA, type StatoFattura } from "../../../worker/economia/calcoli";
import { meseRoma } from "../../../worker/lib/roma";
import { Errore, Intestazione, Pulsante, Riga, Skeleton, StatoVuoto, Tag } from "../../ds";
import { euro, giorno, nomeMese } from "../../format";
import { useOra } from "../../hooks";
import type { FatturaRiga } from "../../types";
import { useFatture } from "../dati-gestione";
import { Sezione } from "../impostazioni/parti";
import { FoglioFattura } from "./Fogli";

const APERTI: StatoFattura[] = ["in_ritardo", "emessa", "da_emettere"];
const somma = (xs: FatturaRiga[]) => xs.reduce((t, f) => t + f.amountCents, 0);

function metaFattura(f: FatturaRiga, ora: number) {
  if (f.stato === "incassata") return `incassata ${giorno(f.paidAt!, ora)}`;
  if (f.dueAt == null) return "da emettere";
  return `${f.stato === "in_ritardo" ? "scaduta" : "scade"} ${giorno(f.dueAt, ora)}`;
}

export function RigaFattura({ f, ora, onClick }: { f: FatturaRiga; ora: number; onClick?: () => void }) {
  return <Riga titolo={f.cliente} secondaria={euro(f.amountCents)} meta={metaFattura(f, ora)} destra={<Tag>{ETICHETTE_TIPO_FATTURA[f.kind]}</Tag>} onClick={onClick} />;
}

// Spec 9.3: gruppi in ritardo, emesse, da emettere, incassate (a scomparsa, per mese).
export function Fatture({ ora: oraFissa }: { ora?: number } = {}) {
  const ora = useOra(60_000, oraFissa);
  const q = useFatture();
  const [aperta, setAperta] = useState<FatturaRiga | null>(null);
  const eyebrow = nomeMese(meseRoma(ora));
  if (q.isLoading) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Fatture" eyebrow={eyebrow} /><Skeleton righe={8} /></div>;
  if (q.error) return <div className="mx-auto max-w-[720px] p-4"><Intestazione titolo="Fatture" eyebrow={eyebrow} /><Errore errore={q.error} onRiprova={() => void q.refetch()} /></div>;
  const fatture = q.data!;
  const di = (s: StatoFattura) => fatture.filter((f) => f.stato === s);
  const ritardo = di("in_ritardo");
  const perMese = new Map<string, FatturaRiga[]>();
  for (const f of [...di("incassata")].sort((a, b) => b.paidAt! - a.paidAt!)) {
    const m = meseRoma(f.paidAt!);
    perMese.set(m, [...(perMese.get(m) ?? []), f]);
  }
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 p-4">
      <Intestazione titolo="Fatture" numero={euro(somma([...ritardo, ...di("emessa")]))} coda="da incassare" eyebrow={eyebrow}>
        {ritardo.length > 0 && <p className="text-corpo text-errore">{ritardo.length === 1 ? "1 in ritardo" : `${ritardo.length} in ritardo`}</p>}
      </Intestazione>
      {fatture.length === 0 && <StatoVuoto titolo="Nessuna fattura" testo="La prima nasce dal +." />}
      {APERTI.map((s) => di(s).length > 0 && (
        <Sezione key={s} titolo={ETICHETTE_FATTURA[s]}>
          <ul className="grid gap-2">{di(s).map((f) => <li key={f.id}><RigaFattura f={f} ora={ora} onClick={() => setAperta(f)} /></li>)}</ul>
          {s === "in_ritardo" && <Pulsante variante="primario" misura="lg" className="w-full sm:w-auto" onClick={() => setAperta(ritardo[0])}>Segna incassata</Pulsante>}
        </Sezione>
      ))}
      {perMese.size > 0 && (
        <Sezione titolo={ETICHETTE_FATTURA.incassata}>
          {[...perMese.entries()].map(([mese, xs]) => (
            <details key={mese}>
              <summary className="flex min-h-11 cursor-pointer items-center py-2 text-corpo font-semibold tabular-nums">{`${nomeMese(mese)}: ${euro(somma(xs))}`}</summary>
              <ul className="grid gap-2 pb-2">{xs.map((f) => <li key={f.id}><RigaFattura f={f} ora={ora} onClick={() => setAperta(f)} /></li>)}</ul>
            </details>
          ))}
        </Sezione>
      )}
      {aperta && <FoglioFattura f={aperta} ora={ora} onChiudi={() => setAperta(null)} />}
    </div>
  );
}
