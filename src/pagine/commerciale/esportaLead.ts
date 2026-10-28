import { partiRoma } from "../../../worker/lib/roma";
import { SOURCE_LABELS } from "../../format";
import type { Stage } from "../../types";
import type { RigaLead } from "./tabellaLead";

// "Esporta CSV" della tabella dei lead (contratto blocco 1, sezione 4, modifica 21): le righe filtrate, tutte le
// colonne (anche quelle nascoste), pronto per Excel italiano: UTF-8 con BOM (accenti giusti), separatore ";",
// righe chiuse da CRLF, date "gg/mm/aaaa hh:mm" all'ora di Roma, importi con la virgola.

const BOM = "﻿";
const PUNTEGGIO = { verde: "Verde", giallo: "Giallo", grigio: "Grigio" } as const;
const STATO = { scaduto: "Scaduto", oggi: "Oggi", futuro: "In tempo" } as const;
const due = (n: number) => String(n).padStart(2, "0");

export function dataCsv(ms: number | null | undefined): string {
  if (ms == null) return "";
  const p = partiRoma(ms);
  return `${due(p.giorno)}/${due(p.mese)}/${p.anno} ${due(p.ore)}:${due(p.minuti)}`;
}

const importo = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

// Virgolette solo quando servono: separatore, virgolette, a capo, o spazi ai bordi.
export function cellaCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[;"\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLead(righe: RigaLead[], fasi: Stage[], utenti: { id: string; name: string }[]): string {
  const fase = new Map(fasi.map((f) => [f.id, f.label]));
  const nome = new Map(utenti.map((u) => [u.id, u.name]));
  const colonne: [string, (l: RigaLead) => string | number | null | undefined][] = [
    ["Azienda", (l) => l.company],
    ["Persona", (l) => l.contactName],
    ["Fase", (l) => fase.get(l.stageId) ?? l.stageId],
    ["Da fare", (l) => l.prossima?.azione],
    ["Scadenza", (l) => dataCsv(l.prossima?.scadenza)],
    ["Stato scadenza", (l) => (l.prossima?.stato ? STATO[l.prossima.stato] : "")],
    ["Responsabile", (l) => (l.ownerId ? nome.get(l.ownerId) ?? l.ownerId : "")],
    ["Fonte", (l) => SOURCE_LABELS[l.source] ?? l.source],
    ["Campagna", (l) => l.metaCampaign],
    ["Ultimo contatto", (l) => dataCsv(l.ultimoContatto)],
    ["Telefono", (l) => l.phone],
    ["Email", (l) => l.email],
    ["Punteggio", (l) => (l.score ? PUNTEGGIO[l.score] : "")],
    ["Arrivato il", (l) => dataCsv(l.createdAt)],
    ["Tentativi", (l) => l.attemptCount],
    ["Setup (euro)", (l) => importo(l.setupCents)],
    ["Canone mensile (euro)", (l) => importo(l.feeCents)],
  ];
  const righeCsv = [colonne.map(([t]) => t), ...righe.map((l) => colonne.map(([, f]) => f(l)))];
  return BOM + righeCsv.map((r) => r.map(cellaCsv).join(";")).join("\r\n") + "\r\n";
}

export const nomeFileCsv = (ora: number) => {
  const p = partiRoma(ora);
  return `lead-${p.anno}-${due(p.mese)}-${due(p.giorno)}.csv`;
};

export function scaricaCsv(testo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
