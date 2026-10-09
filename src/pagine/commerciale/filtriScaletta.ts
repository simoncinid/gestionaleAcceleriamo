import type { Vista } from "../../../worker/leads/service";
import type { Opzione } from "../../ds";
import type { LeadListItem, Stage } from "../../types";

export type Filtri = { q: string; ownerId: string; source: string; campaign: string; score: string; da: number | null; a: number | null };
export const FILTRI_VUOTI: Filtri = { q: "", ownerId: "", source: "", campaign: "", score: "", da: null, a: null };

export const ETICHETTE_VISTE: { id: Vista; etichetta: string }[] = [
  { id: "nuovi", etichetta: "Nuovi" },
  { id: "da-richiamare", etichetta: "Da richiamare" },
  { id: "in-attesa", etichetta: "In attesa" },
  { id: "in-pausa", etichetta: "In pausa" },
  { id: "scartati", etichetta: "Scartati" },
];

export function parametri(f: Filtri, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== "" && v != null) p.set(k, String(v));
  return p.toString();
}

// Il punto sul pulsante Filtri: la ricerca ha il suo campo e non conta.
export const filtriAttivi = (f: Filtri) => parametri({ ...f, q: "" }) !== "";

export function perFase(leads: LeadListItem[]): Map<string, LeadListItem[]> {
  const m = new Map<string, LeadListItem[]>();
  for (const l of leads) m.set(l.stageId, [...(m.get(l.stageId) ?? []), l]);
  return m;
}

export const totali = (leads: LeadListItem[]) =>
  leads.reduce((t, l) => ({ setupCents: t.setupCents + (l.setupCents ?? 0), feeCents: t.feeCents + (l.feeCents ?? 0) }), { setupCents: 0, feeCents: 0 });

export const TUTTE = "tutte";

// Campagne distinte dei lead, per il foglio Filtri.
export const campagneDi = (leads: LeadListItem[]) => [...new Set(leads.map((l) => l.metaCampaign).filter((c): c is string => !!c))];

// Sopratitolo della Scaletta: con una fase scelta sul telefono "N in questa fase" (prototipo 11), altrimenti i lead aperti.
export function sopratitolo(modo: "colonne" | "elenco", fase: string, n: { aperti: number; fase: number; vista: number }) {
  if (modo === "elenco") return `${n.vista} lead in questa vista`;
  return fase === TUTTE ? `${n.aperti} lead aperti` : `${n.fase} in questa fase`;
}
export const ordinate = (fasi: Stage[]) => [...fasi].sort((a, b) => a.sortOrder - b.sortOrder);
const aperte = (fasi: Stage[]) => ordinate(fasi).filter((f) => f.kind === "open");

// Spec 6.5 e PV5: "Tutte" (i lead aperti) più le dodici fasi nell'ordine del processo, con i conteggi.
export function opzioniFase(fasi: Stage[], gruppi: Map<string, LeadListItem[]>): Opzione<string>[] {
  const nAperti = aperte(fasi).reduce((n, f) => n + (gruppi.get(f.id)?.length ?? 0), 0);
  return [
    { valore: TUTTE, etichetta: "Tutte", meta: String(nAperti) },
    ...ordinate(fasi).map((f) => ({ valore: f.id, etichetta: f.label, meta: String(gruppi.get(f.id)?.length ?? 0) })),
  ];
}

// La lista del telefono: con "Tutte" i lead aperti fase dopo fase, altrimenti quelli della fase scelta.
export function listaTelefono(scelta: string, fasi: Stage[], gruppi: Map<string, LeadListItem[]>): LeadListItem[] {
  if (scelta !== TUTTE) return gruppi.get(scelta) ?? [];
  return aperte(fasi).flatMap((f) => gruppi.get(f.id) ?? []);
}

// PV6: la lente della testata apre /commerciale/scaletta?cerca=1. Fuoco sulla ricerca, poi il parametro sparisce
// (con replace) perché un aggiornamento della pagina non lo rimetta.
export function applicaCerca(params: URLSearchParams, campo: { focus: () => void } | null, sostituisci: (p: URLSearchParams) => void): boolean {
  if (params.get("cerca") !== "1") return false;
  campo?.focus();
  const resto = new URLSearchParams(params);
  resto.delete("cerca");
  sostituisci(resto);
  return true;
}
