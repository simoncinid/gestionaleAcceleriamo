import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../api";
import { Errore, Intestazione, Pulsante, Selettore, Skeleton, StatoVuoto } from "../../ds";
import { giorno, momento } from "../../format";
import { useUsers } from "../../hooks";
import type { VoceDiario } from "../../types";

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
    <div className="flex flex-col gap-6 p-4 md:p-0 md:pb-8">
      <Intestazione titolo="Diario" eyebrow="Chi ha fatto cosa" />
      <div className="flex flex-col gap-3 @4xl:grid @4xl:grid-cols-3 @4xl:gap-4">
        <Selettore etichetta="Chi" opzioni={persone} valore={chi} onCambia={setChi} />
        <Selettore etichetta="Area" opzioni={AREE} valore={area} onCambia={setArea} />
        <Selettore etichetta="Tipo" opzioni={TIPI} valore={tipo} onCambia={setTipo} />
      </div>
      {q.isLoading ? <Skeleton righe={8} /> : q.error ? <Errore errore={q.error} onRiprova={() => void q.refetch()} /> : voci.length === 0 ? (
        <StatoVuoto titolo="Nessuna voce" testo="Cambia i filtri per vedere altro." />
      ) : (
        // Schermo largo: i giorni affiancati, dal più recente, come pagine di un'agenda.
        <div className="flex flex-col gap-6 @5xl:grid @5xl:grid-cols-[repeat(auto-fill,minmax(420px,1fr))] @5xl:items-start @5xl:gap-x-8">
        {[...perGiorno.entries()].map(([g, elenco]) => (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="font-display text-sezione">{g}</h2>
            <ul className="flex flex-col divide-y divide-sabbia rounded-blocco border border-sabbia bg-avorio">
              {elenco.map((v) => (
                <li key={v.id}>
                  {/* Con un collegamento tutta la riga è il bersaglio (QA Task 15: il solo testo era alto 20 px). */}
                  {v.href ? (
                    <Link to={v.href} className="group flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-crema">
                      <span className="text-nota text-ink underline-offset-2 group-hover:underline">{v.testo}</span>
                      {v.dettaglio && <span className="break-words text-nota text-grigio">{v.dettaglio}</span>}
                      <span className="text-nota text-grigio">{v.chi} · {momento(v.at, ora)}</span>
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-nota text-ink">{v.testo}</span>
                      {v.dettaglio && <span className="break-words text-nota text-grigio">{v.dettaglio}</span>}
                      <span className="text-nota text-grigio">{v.chi} · {momento(v.at, ora)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        </div>
      )}
      {q.hasNextPage && <div><Pulsante variante="fantasma" inCorso={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Mostra le voci prima</Pulsante></div>}
    </div>
  );
}
