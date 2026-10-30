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
    // Computer largo: ricorrente, scenari e fasi affiancati (tre colonne a 2000 px, due a 1440 px).
    <div className="grid items-start gap-6 @5xl:grid-cols-2 @5xl:gap-8 @7xl:grid-cols-3">
      <div className="flex flex-col gap-6 @7xl:col-span-2 @7xl:grid @7xl:grid-cols-2 @7xl:items-start @7xl:gap-8">
      <Gruppo titolo="Ricorrente">
        {/* Il solo dato in evidenza della schermata: la barra è arancione. */}
        <Voce nome="Canoni firmati" numero={`${euro(p.ricorrenteCents)} su ${euro(p.obiettivoCents)}`} dettaglio="Dai canoni attivi di Economia, contro l'obiettivo al mese" quota={quotaObiettivo} evidenza />
      </Gruppo>
      <div className="flex flex-col gap-6">
      <Gruppo titolo="Se chiudiamo tutto" meta={`${p.lead} ${p.lead === 1 ? "lead aperto" : "lead aperti"}`}>
        <Voce nome="Setup atteso" numero={euro(p.setupTotaleCents)} />
        <Voce nome="Canoni attesi" numero={`${euro(p.canoneTotaleCents)} al mese`} />
      </Gruppo>
      <Gruppo titolo="Pesato per probabilità">
        <Voce nome="Setup" numero={euro(p.setupPesatoCents)} />
        <Voce nome="Canoni" numero={`${euro(p.canonePesatoCents)} al mese`} />
      </Gruppo>
      </div>
      </div>
      <div className="flex flex-col gap-6">
      {p.fasi.length > 0 && (
        <Gruppo titolo="Setup pesato per fase">
          {p.fasi.map((f) => <Voce key={f.stageId} nome={f.label} numero={euro(f.setupPesatoCents)} dettaglio={`${f.lead} lead al ${f.probabilita}%`}
            quota={(f.setupPesatoCents / Math.max(...p.fasi.map((x) => x.setupPesatoCents), 1)) * 100} />)}
        </Gruppo>
      )}
      <p className="text-nota text-grigio">La probabilità è quella della fase, impostata in Fasi e regole. Vale la proposta aperta più recente; la proprietà del codice conta solo il setup.</p>
      </div>
    </div>
  );
}
