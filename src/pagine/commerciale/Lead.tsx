import { Intestazione } from "../../ds";

// Tabella dei lead (contratto blocco 1, sezione 4). Segnaposto fissato prima delle corsie: la costruisce la corsia C (modifiche 18-21).
export function Lead() {
  return <div className="p-4 md:p-0 md:pb-8"><Intestazione titolo="Lead" eyebrow="Tutti i lead" /></div>;
}
