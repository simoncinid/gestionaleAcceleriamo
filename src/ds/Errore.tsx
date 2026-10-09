import { ApiError } from "../api";
import { Pulsante } from "./Pulsante";

export function Errore({ errore, onRiprova }: { errore: unknown; onRiprova: () => void }) {
  const id = errore instanceof ApiError ? (errore.body as { errorId?: string } | undefined)?.errorId : undefined;
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-blocco bg-errore-fondo p-6">
      <p className="font-display text-titolo-card">Non riesco a caricare questa pagina</p>
      <p className="text-secondaria">{errore instanceof Error ? errore.message : "Errore sconosciuto"}</p>
      {id && <p className="text-meta">Codice {id}</p>}
      <Pulsante onClick={onRiprova}>Riprova</Pulsante>
    </div>
  );
}
