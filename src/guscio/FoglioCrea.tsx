import { Foglio, Riga } from "../ds";
import type { Creazione } from "./aree";

// Foglio aperto dal "+" della testata (o da "Crea" sul computer): le creazioni dell'area.
export function FoglioCrea({ aperto, voci, onChiudi, onScegli }: { aperto: boolean; voci: { id: Creazione; etichetta: string }[]; onChiudi: () => void; onScegli: (c: Creazione) => void }) {
  return (
    <Foglio aperto={aperto} titolo="Cosa vuoi creare?" onChiudi={onChiudi}>
      <ul className="flex flex-col gap-2">
        {voci.map((c) => (
          <li key={c.id}><Riga titolo={c.etichetta} onClick={() => onScegli(c.id)} /></li>
        ))}
      </ul>
    </Foglio>
  );
}
