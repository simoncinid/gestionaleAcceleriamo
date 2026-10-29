import { ApiError, LOGOUT_REASON_KEY } from "./api";

// Documenti dei lead (spec 29/10/2026): stessi tipi e limite del server (worker/leads/documenti.ts).
export const LIMITE_FILE = 100 * 1024 * 1024;
export const ESTENSIONI = ["pdf", "txt", "csv", "xls", "xlsx", "doc", "docx", "m4a", "mp3", "ogg", "opus", "wav", "aac", "jpg", "jpeg", "png", "heic"];
export const ACCETTA = ESTENSIONI.map((e) => `.${e}`).join(",");

// Motivo per cui un file non si può caricare, o null se va bene.
export function fileNonAmmesso(f: File): string | null {
  const est = /\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1]?.toLowerCase() ?? "";
  if (!ESTENSIONI.includes(est)) return `"${f.name}": tipo non ammesso. Vanno bene PDF, TXT, Excel, Word, audio e immagini`;
  if (f.size === 0) return `"${f.name}" è vuoto`;
  if (f.size > LIMITE_FILE) return `"${f.name}" supera i 100 MB`;
  return null;
}

// Carica un file col corpo grezzo (come lo legge il Worker) e segnala l'avanzamento da 0 a 1.
// XMLHttpRequest e non fetch: fetch non dà l'avanzamento dell'invio.
export function caricaFile(path: string, file: File, onAvanzamento: (p: number) => void): Promise<unknown> {
  return new Promise((ok, ko) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onAvanzamento(e.loaded / e.total); };
    xhr.onerror = () => ko(new ApiError(0, "Connessione interrotta: riprova"));
    xhr.onload = () => {
      let data: { error?: string; errorId?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* risposta vuota */ }
      if (xhr.status === 401) {
        sessionStorage.setItem(LOGOUT_REASON_KEY, "La sessione è scaduta: rientra per continuare. Le modifiche non salvate vanno rifatte.");
        window.dispatchEvent(new Event("acc:logout"));
      }
      if (xhr.status >= 200 && xhr.status < 300) return ok(data);
      ko(new ApiError(xhr.status, data.error ? (data.errorId ? `${data.error} (codice ${data.errorId})` : data.error) : `Errore ${xhr.status}`, data));
    };
    xhr.send(file);
  });
}

export function peso(byte: number | null | undefined) {
  if (!byte) return "";
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} kB`;
  return `${(byte / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}
