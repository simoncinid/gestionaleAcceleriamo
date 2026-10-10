import { toast } from "sonner";
import { ApiError } from "./api";

// Ricaduta dei commit server del Task 14a: nello spazio demo password, nome e invii verso l'esterno rispondono 409.
// Non è un guasto: un toast neutro spiega perché, invece del rosso dell'errore.
export function eBloccoDemo(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 409 && /spazio demo/i.test(e.message);
}

export function testoBloccoDemo(e: ApiError): { titolo: string; spiegazione: string } {
  const motivo = e.message.replace(/^Spazio demo:\s*/i, "");
  return { titolo: motivo.charAt(0).toUpperCase() + motivo.slice(1), spiegazione: "Sei nello spazio demo: i dati sono finti e questa azione è spenta. Nell'app vera funziona." };
}

export function mostraErrore(e: Error) {
  if (eBloccoDemo(e)) {
    const t = testoBloccoDemo(e);
    toast(t.titolo, { description: t.spiegazione });
    return;
  }
  toast.error(e.message);
}

// Voce 59 dell'addendum: l'import a blocchi non è atomico, il messaggio dice quali righe del file sono entrate.
export function messaggioImportInterrotto(messaggio: string, righeDelFile: number[], entrate: number): string {
  if (entrate <= 0) return `${messaggio}. Nessuna riga importata: riprova`;
  const ultima = righeDelFile[entrate - 1];
  const prossima = righeDelFile[entrate];
  return prossima == null
    ? `${messaggio}. Entrate tutte le righe fino alla ${ultima} del file`
    : `${messaggio}. Entrate le righe fino alla ${ultima} del file; dalla riga ${prossima} in poi no`;
}

// Minore 3 della review: il server rifiuta con 422 una call nel passato; il messaggio va sotto la data, non in un toast.
export const eCallNelPassato = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 422 && e.message.startsWith("La call è nel passato");
