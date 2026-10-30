import type { DocumentRow } from "../../../types";

// Dove sta ogni documento nella scheda (30/10/2026): registrazioni e trascrizioni sotto la loro call, i preventivi nel
// blocco Preventivo, il resto nel foglio Documenti. Un documento compare in un posto solo.
// Registrazione o trascrizione la cui call non è tra quelle del lead (tolta, o arrivata da un'unione): resta in Documenti.
// Documento di una cosa da fare: sta sulla sua riga finché la task è aperta; fatta o eliminata, torna in Documenti.
export type Smistati = { perCall: Map<string, DocumentRow[]>; perTask: Map<string, DocumentRow[]>; preventivi: DocumentRow[]; altri: DocumentRow[] };

export function smista(documenti: DocumentRow[], callDelLead: string[], taskAperte: string[] = []): Smistati {
  const call = new Set(callDelLead);
  const task = new Set(taskAperte);
  const perCall = new Map<string, DocumentRow[]>();
  const perTask = new Map<string, DocumentRow[]>();
  const preventivi: DocumentRow[] = [];
  const altri: DocumentRow[] = [];
  for (const d of documenti) {
    const k = d.kind ?? "altro";
    if (d.taskId && task.has(d.taskId) && d.file) perTask.set(d.taskId, [...(perTask.get(d.taskId) ?? []), d]);
    else if ((k === "registrazione" || k === "trascrizione") && d.callId && call.has(d.callId) && d.file) {
      perCall.set(d.callId, [...(perCall.get(d.callId) ?? []), d]);
    } else if (k === "preventivo" && d.file) preventivi.push(d);
    else altri.push(d);
  }
  // Sotto la call: prima le registrazioni, poi le trascrizioni, dalla più vecchia (Registrazione 1, 2...).
  for (const [id, l] of perCall) perCall.set(id, l.sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === "registrazione" ? -1 : 1)));
  // Il preventivo in evidenza è quello aggiornato per ultimo.
  preventivi.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  return { perCall, perTask, preventivi, altri };
}

export const fileDi = (id: string) => `/api/documents/${id}/file`;
