import { Intestazione } from "../../ds";

// Pagina di una call, /commerciale/call/:id (contratto blocco 1, sezione 3). Segnaposto fissato prima delle corsie:
// la costruisce la corsia B (modifiche 12 e 16), i dati li dà la corsia A (modifica 13).
export function DettaglioCall() {
  return <div className="p-4 md:p-0 md:pb-8"><Intestazione titolo="Call" eyebrow="Commerciale" /></div>;
}
