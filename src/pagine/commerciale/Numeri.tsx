import { useSearchParams } from "react-router";
import { Chip, Intestazione } from "../../ds";
import { Campagne } from "./numeri/Campagne";
import { Funnel } from "./numeri/Funnel";
import { Previsione } from "./numeri/Previsione";

const SEGMENTI = [["", "Funnel"], ["campagne", "Campagne"], ["previsione", "Previsione"]] as const;

// Spec 6.9: tre segmenti fissi (chip ammesse: sono 3 voci), segmento nell'indirizzo come nel prototipo.
export function Numeri({ ora }: { ora?: number }) {
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") ?? "";
  return (
    // Sul telefono resta la misura di sempre; sul computer la pagina usa tutta la larghezza e ogni vista
    // si impagina in colonne sulla larghezza del contenitore (@5xl, @7xl).
    <div className="flex flex-col gap-6 p-4 md:px-0 md:pt-0">
      <Intestazione titolo="Numeri">
        <div className="flex flex-wrap gap-2 pt-3" role="group" aria-label="Segmento">
          {SEGMENTI.map(([v, t]) => <Chip key={v} selezionato={v === vista} onClick={() => setParams(v ? { vista: v } : {}, { replace: true })}>{t}</Chip>)}
        </div>
      </Intestazione>
      {vista === "campagne" ? <Campagne ora={ora} /> : vista === "previsione" ? <Previsione /> : <Funnel ora={ora} />}
    </div>
  );
}
