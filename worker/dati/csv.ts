// CSV come lo scrivono Excel e Google Fogli: separatore "," o ";" (scelto dalla prima riga), virgolette doppie.
export function leggiCsv(testo: string): string[][] {
  const t = testo.replace(/^﻿/, "");
  const primaRiga = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primaRiga.match(/;/g)?.length ?? 0) > (primaRiga.match(/,/g)?.length ?? 0) ? ";" : ",";
  const righe: string[][] = [];
  let riga: string[] = [];
  let cella = "";
  let tra = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (tra) {
      if (ch === '"' && t[i + 1] === '"') { cella += '"'; i++; }
      else if (ch === '"') tra = false;
      else cella += ch;
    } else if (ch === '"') tra = true;
    else if (ch === sep) { riga.push(cella); cella = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riga.push(cella); cella = "";
      if (riga.some((x) => x.trim() !== "")) righe.push(riga);
      riga = [];
    } else cella += ch;
  }
  riga.push(cella);
  if (riga.some((x) => x.trim() !== "")) righe.push(riga);
  return righe;
}

// Excel prende per formula una cella che inizia con = + - @ (o tab, a capo): l'apostrofo la lascia testo.
export function cellaCsv(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CampoImport = "company" | "contactName" | "email" | "phone" | "website" | "notes";
const SINONIMI: Record<CampoImport, string[]> = {
  company: ["azienda", "ragione sociale", "societa", "company", "nome azienda"],
  contactName: ["referente", "nome e cognome", "nome", "contatto", "contact name"],
  email: ["email", "e-mail", "mail", "posta"],
  phone: ["telefono", "cellulare", "tel", "phone", "numero"],
  website: ["sito", "sito web", "website", "web"],
  notes: ["note", "notes", "appunti"],
};
const pulisci = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function colonneImport(intestazione: string[]): Partial<Record<CampoImport, number>> {
  const out: Partial<Record<CampoImport, number>> = {};
  intestazione.forEach((h, i) => {
    const k = pulisci(h);
    const campo = (Object.keys(SINONIMI) as CampoImport[]).find((c) => SINONIMI[c].includes(k));
    if (campo && out[campo] === undefined) out[campo] = i;
  });
  return out;
}
