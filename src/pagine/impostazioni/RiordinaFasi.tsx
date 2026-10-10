import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { Foglio, Pulsante } from "../../ds";
import type { Stage } from "../../types";

// Si sposta solo dentro lo stesso gruppo: le aperte restano prima di vinte e perse (le regole contano sull'ordine).
export function spostaFase(fasi: Stage[], id: string, verso: -1 | 1): string[] | null {
  const i = fasi.findIndex((x) => x.id === id);
  const j = i + verso;
  if (i < 0 || j < 0 || j >= fasi.length || fasi[j].kind !== fasi[i].kind) return null;
  const ids = fasi.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

const GRUPPO: Record<Stage["kind"], string> = { open: "Aperte", won: "Vinta", lost: "Perse" };
const perOrdine = (fasi: Stage[]) => [...fasi].sort((a, b) => a.sortOrder - b.sortOrder);

// QA 11 del Piano A (prototipo 29): frecce su e giù, "Salva l'ordine" unica azione del foglio.
export function RiordinaFasi({ fasi, onChiudi }: { fasi: Stage[]; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [ordine, setOrdine] = useState(() => perOrdine(fasi));
  const iniziale = perOrdine(fasi);
  const cambiato = ordine.some((x, i) => x.id !== iniziale[i].id);
  const salva = useMutation({
    mutationFn: () => api("/stages/order", { method: "PUT", json: { ids: ordine.map((x) => x.id) } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["stages"] }); toast.success("Ordine delle fasi salvato"); onChiudi(); },
    onError: (e) => toast.error(e.message),
  });
  const sposta = (id: string, verso: -1 | 1) => {
    const ids = spostaFase(ordine, id, verso);
    if (ids) setOrdine(ids.map((x) => ordine.find((s) => s.id === x)!));
  };
  return (
    <Foglio aperto titolo="Riordina le fasi" onChiudi={onChiudi}
      principale={<Pulsante variante="primario" misura="lg" className="w-full" inCorso={salva.isPending} motivoSpento={cambiato ? undefined : "Sposta almeno una fase"} onClick={() => salva.mutate()}>Salva l'ordine</Pulsante>}>
      <p className="text-secondaria text-grigio">L'ordine è quello della Scaletta e del menu delle fasi. Le aperte restano sempre prima della vinta e delle perse.</p>
      <ul className="flex flex-col divide-y divide-sabbia">
        {ordine.map((x, i) => (
          <li key={x.id} className="flex min-h-[60px] items-center gap-2">
            <span className="grid min-w-0 flex-1">
              <span className="break-words text-corpo">{x.label}</span>
              {(i === 0 || ordine[i - 1].kind !== x.kind) && <span className="text-meta text-grigio">{GRUPPO[x.kind]}</span>}
            </span>
            <Pulsante variante="icona" className="w-11 px-0!" aria-label={`Sposta ${x.label} più su`} motivoSpento={spostaFase(ordine, x.id, -1) ? undefined : "È già la prima del suo gruppo"}
              icona={<ArrowUp size={20} weight="bold" aria-hidden />} onClick={() => sposta(x.id, -1)} />
            <Pulsante variante="icona" className="w-11 px-0!" aria-label={`Sposta ${x.label} più giù`} motivoSpento={spostaFase(ordine, x.id, 1) ? undefined : "È già l'ultima del suo gruppo"}
              icona={<ArrowDown size={20} weight="bold" aria-hidden />} onClick={() => sposta(x.id, 1)} />
          </li>
        ))}
      </ul>
    </Foglio>
  );
}
