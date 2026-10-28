import { useEffect, useState } from "react";
import { partiRoma } from "../../../worker/lib/roma";
import type { Ordine, RigaLead } from "./tabellaLead";

// Blocco 1 bis, punto 4: le colonne del foglio "CRM LEAD" di Diego nella tabella dei lead, scelte da chi la usa.
// Dodici colonne in tutto (Azioni a parte, sempre in fondo); Azienda, Fase e Da fare non si tolgono.
// Seconda passata: Responsabile non è più una colonna (resta il filtro in alto, il CSV e la scheda).
// La scelta vive nel browser, una per utente (localStorage), non nell'indirizzo: è un'abitudine, non un filtro.
export type IdColonna =
  | "azienda" | "telefono" | "fase" | "dafare" | "contatto" | "arrivato"
  | "email" | "inserzione" | "settore" | "attivita" | "offerta" | "fonte";

export type DefColonna = { id: IdColonna; titolo: string; px: number; fissa?: boolean; ordine?: Ordine };

// Ordine di lettura nella tabella. Larghezze in px: le sei di partenza più Azioni fanno 941 px e stanno nei
// 1118 px che restano a 1440 accanto alla barra laterale (Fase larga quanto "Nuovo, da chiamare" con la freccia);
// con più colonne la tabella scorre di lato dentro il suo contenitore.
export const COLONNE: DefColonna[] = [
  { id: "azienda", titolo: "Azienda", px: 165, fissa: true, ordine: "azienda" },
  { id: "telefono", titolo: "Telefono", px: 150 },
  { id: "fase", titolo: "Fase", px: 186, fissa: true, ordine: "fase" },
  { id: "dafare", titolo: "Da fare", px: 195, fissa: true, ordine: "scadenza" },
  { id: "contatto", titolo: "Ultimo contatto", px: 115, ordine: "contatto" },
  { id: "arrivato", titolo: "Arrivato il", px: 100, ordine: "arrivo" },
  { id: "email", titolo: "Email", px: 220 },
  { id: "inserzione", titolo: "Inserzione", px: 220 },
  { id: "settore", titolo: "Settore", px: 160 },
  { id: "attivita", titolo: "Attività", px: 200 },
  { id: "offerta", titolo: "Offerta", px: 170 },
  { id: "fonte", titolo: "Fonte", px: 130 },
];
export const PX_AZIONI = 44; // solo il menu "⋯" da 32 px più 2 × 4 px di margine

export const VISIBILI_BASE: IdColonna[] = ["azienda", "telefono", "fase", "dafare", "contatto", "arrivato"];

const chiave = (utente: string | null | undefined) => `lead-colonne:${utente ?? "ospite"}`;

// Legge la scelta salvata; quello che non si riconosce si scarta, le fisse ci sono sempre.
export function leggiColonne(testo: string | null): IdColonna[] {
  let salvate: unknown = null;
  try { salvate = testo ? JSON.parse(testo) : null; } catch { salvate = null; }
  if (!Array.isArray(salvate)) return VISIBILI_BASE;
  const ok = new Set(salvate.filter((x): x is IdColonna => COLONNE.some((c) => c.id === x)));
  for (const c of COLONNE) if (c.fissa) ok.add(c.id);
  return COLONNE.filter((c) => ok.has(c.id)).map((c) => c.id);
}

export function useColonneLead(utente: string | null | undefined): [IdColonna[], (v: IdColonna[]) => void] {
  const [visibili, setVisibili] = useState<IdColonna[]>(VISIBILI_BASE);
  useEffect(() => {
    try { setVisibili(leggiColonne(window.localStorage.getItem(chiave(utente)))); } catch { /* niente localStorage: restano quelle di base */ }
  }, [utente]);
  const cambia = (v: IdColonna[]) => {
    const pulite = leggiColonne(JSON.stringify(v));
    setVisibili(pulite);
    try { window.localStorage.setItem(chiave(utente), JSON.stringify(pulite)); } catch { /* scelta valida solo per questa visita */ }
  };
  return [visibili, cambia];
}

// "Lavoro ripetuto, video 3.mp4 copia" diventa "Lavoro ripetuto, video 3"; senza ".mp4" i primi 32 caratteri.
export function inserzioneBreve(ad: string | null | undefined): string {
  if (!ad) return "";
  const i = ad.toLowerCase().indexOf(".mp4");
  if (i > 0) return ad.slice(0, i).trim();
  return ad.length > 32 ? `${ad.slice(0, 32).trimEnd()}…` : ad;
}

const normalizza = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_?¿:]+/g, " ").replace(/\s+/g, " ").trim();
// "gestione_preventivi" diventa "Gestione preventivi".
const leggibile = (s: string) => { const t = s.replace(/_/g, " ").replace(/\s+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// Risposta a una domanda del modulo Meta, cercata per parole chiave nel nome della domanda (Meta la salva come
// "in_che_settore_opera_la_tua_azienda?", il Foglio Andrea con la domanda scritta per intero).
export function rispostaModulo(metaAnswers: string | null | undefined, parole: string[]): string {
  if (!metaAnswers) return "";
  let v: unknown;
  try { v = JSON.parse(metaAnswers); } catch { return ""; }
  if (!v || typeof v !== "object") return "";
  const coppie: [string, unknown][] = Array.isArray(v)
    ? (v as { name?: string; values?: unknown[] }[]).map((x) => [x?.name ?? "", (x?.values ?? []).join(", ")])
    : Object.entries(v as Record<string, unknown>);
  const trovata = coppie.find(([k]) => { const n = normalizza(k); return parole.every((p) => n.includes(p)); });
  if (!trovata || trovata[1] == null) return "";
  return leggibile(Array.isArray(trovata[1]) ? trovata[1].join(", ") : String(trovata[1]));
}
export const settoreDi = (l: Pick<RigaLead, "metaAnswers">) => rispostaModulo(l.metaAnswers, ["settore"]);
export const attivitaDi = (l: Pick<RigaLead, "metaAnswers">) => rispostaModulo(l.metaAnswers, ["perdere", "tempo"]);

// "1.500 € + 150/mese"; solo una delle due parti se l'altra manca.
const migliaia = (cents: number) => String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function offertaBreve(setup: number | null | undefined, canone: number | null | undefined): string {
  const parti = [setup != null ? `${migliaia(setup)} €` : null, canone != null ? `${migliaia(canone)}/mese` : null].filter(Boolean);
  return parti.join(" + ");
}

// "21/10" (con l'anno se non è quello in corso).
export function arrivatoBreve(ms: number, ora: number): string {
  const p = partiRoma(ms);
  const due = (n: number) => String(n).padStart(2, "0");
  return `${due(p.giorno)}/${due(p.mese)}${p.anno !== partiRoma(ora).anno ? `/${String(p.anno).slice(2)}` : ""}`;
}
