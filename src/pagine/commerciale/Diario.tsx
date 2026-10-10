import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Selettore, Skeleton, StatoVuoto } from "../../ds";
import { giorno, momento } from "../../format";
import { useUsers } from "../../hooks";
import type { VoceDiario } from "../../types";
import { SegmentiOggi } from "./SegmentiOggi";

const AREE = [{ valore: "tutte", etichetta: "Tutte le aree" }, { valore: "commerciale", etichetta: "Commerciale" }, { valore: "economia", etichetta: "Economia" }, { valore: "automazioni", etichetta: "Automazioni" }];
const TIPI = [
  { valore: "tutti", etichetta: "Tutto" }, { valore: "esito", etichetta: "Esiti" }, { valore: "chiamata", etichetta: "Chiamate" }, { valore: "nota", etichetta: "Note" },
  { valore: "cambio_fase", etichetta: "Cambi di fase" }, { valore: "modifiche", etichetta: "Modifiche a soldi e automazioni" },
];

// Spec 6.4, scheda Diario: sola lettura, nessun pulsante pieno. Filtri con il Selettore a espansione.
// Ogni voce: cosa (riga secondaria), dettaglio facoltativo, poi "Diego · oggi 10:12" (meta).
export function Diario({ ora = Date.now() }: { ora?: number }) {
  const utenti = useUsers();
  const [chi, setChi] = useState("tutti");
  const [area, setArea] = useState("tutte");
  const [tipo, setTipo] = useState("tutti");
  const q = useInfiniteQuery({
    queryKey: ["diario", chi, area, ...(tipo === "tutti" ? [] : [tipo])],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ chi, area, tipo });
      if (pageParam) p.set("prima", pageParam);
      return api<{ voci: VoceDiario[]; prossimo: string | null }>(`/diario?${p}`);
    },
    getNextPageParam: (p) => p.prossimo,
  });
  const persone = [{ valore: "tutti", etichetta: "Tutti" }, ...(utenti.data ?? []).map((u) => ({ valore: u.id, etichetta: u.name })), { valore: "sistema", etichetta: "Sistema" }];
  const voci = q.data?.pages.flatMap((p) => p.voci) ?? [];
  const perGiorno = new Map<string, VoceDiario[]>();
  for (const v of voci) {
    const g = giorno(v.at, ora);
    perGiorno.set(g, [...(perGiorno.get(g) ?? []), v]);
  }
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-4">
      <Intestazione titolo="Diario" eyebrow="Chi ha fatto cosa" />
      <SegmentiOggi attivo="diario" />
      <div className="flex flex-col gap-3">
        <Selettore etichetta="Chi" opzioni={persone} valore={chi} onCambia={setChi} />
        <Selettore etichetta="Area" opzioni={AREE} valore={area} onCambia={setArea} />
        <Selettore etichetta="Tipo" opzioni={TIPI} valore={tipo} onCambia={setTipo} />
      </div>
      {q.isLoading ? <Skeleton righe={8} /> : q.error ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : voci.length === 0 ? (
        <StatoVuoto titolo="Nessuna voce" testo="Cambia i filtri per vedere altro." />
      ) : (
        [...perGiorno.entries()].map(([g, elenco]) => (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="font-display text-titolo-blocco">{g}</h2>
            <ul className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">
              {elenco.map((v) => (
                <li key={v.id} className="flex flex-col gap-0.5 px-4 py-3">
                  {v.href ? <Link to={v.href} className="text-secondaria text-ink underline-offset-2 hover:underline">{v.testo}</Link> : <span className="text-secondaria text-ink">{v.testo}</span>}
                  {v.dettaglio && <span className="break-words text-secondaria text-grigio">{v.dettaglio}</span>}
                  <span className="text-meta text-grigio">{v.chi} · {momento(v.at, ora)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {q.hasNextPage && <div><Pulsante variante="fantasma" inCorso={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Mostra le voci prima</Pulsante></div>}
    </div>
  );
}
