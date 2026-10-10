import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api";
import { Errore, Skeleton } from "../../../ds";
import { euro } from "../../../format";
import type { Previsione as PrevisioneDati } from "../../../types";
import { Gruppo, Voce } from "./righe";

export function Previsione() {
  const q = useQuery({ queryKey: ["numeri", "previsione"], queryFn: () => api<PrevisioneDati>("/numeri/previsione") });
  const p = q.data;
  if (q.isLoading) return <Skeleton righe={6} />;
  if (q.error || !p) return <Errore errore={q.error} onRiprova={() => void q.refetch()} />;
  const quotaObiettivo = p.obiettivoCents > 0 ? (p.ricorrenteCents / p.obiettivoCents) * 100 : null;
  return (
    <div className="flex flex-col gap-6">
      <Gruppo titolo="Ricorrente">
        {/* Il solo dato in evidenza della schermata: la barra è arancione. */}
        <Voce nome="Canoni firmati" numero={`${euro(p.ricorrenteCents)} su ${euro(p.obiettivoCents)}`} dettaglio="Dai canoni attivi di Economia, contro l'obiettivo al mese" quota={quotaObiettivo} evidenza />
      </Gruppo>
      <Gruppo titolo="Se chiudiamo tutto" meta={`${p.lead} ${p.lead === 1 ? "lead aperto" : "lead aperti"}`}>
        <Voce nome="Setup atteso" numero={euro(p.setupTotaleCents)} />
        <Voce nome="Canoni attesi" numero={`${euro(p.canoneTotaleCents)} al mese`} />
      </Gruppo>
      <Gruppo titolo="Pesato per probabilità">
        <Voce nome="Setup" numero={euro(p.setupPesatoCents)} />
        <Voce nome="Canoni" numero={`${euro(p.canonePesatoCents)} al mese`} />
      </Gruppo>
      {p.fasi.length > 0 && (
        <Gruppo titolo="Setup pesato per fase">
          {p.fasi.map((f) => <Voce key={f.stageId} nome={f.label} numero={euro(f.setupPesatoCents)} dettaglio={`${f.lead} lead al ${f.probabilita}%`} />)}
        </Gruppo>
      )}
      <p className="text-meta text-grigio">La probabilità è quella della fase, impostata in Fasi e regole. Vale la proposta aperta più recente; la proprietà del codice conta solo il setup.</p>
    </div>
  );
}
