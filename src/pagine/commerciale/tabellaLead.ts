import { FASI_APERTE } from "../../../worker/processo/processo";
import { partiRoma } from "../../../worker/lib/roma";
import type { LeadListItem, ProssimaAzione, Stage } from "../../types";

// Logica della tabella dei lead (contratto blocco 1, sezione 4): filtri letti e scritti nell'indirizzo, segmento,
// ricerca, ordinamento, conteggi del titolo ed esportazione. Funzioni pure: la pagina le usa, le prove le chiamano.

// Riga della tabella: il lead di GET /api/leads con la riga "Da fare" della funzione unica e l'ultimo contatto.
export type RigaLead = LeadListItem & { prossima?: ProssimaAzione; ultimoContatto?: number | null };

export type Segmento = "aperti" | "scaduti" | "chiusi";
export type Ordine = "azienda" | "fase" | "scadenza" | "contatto";
export type ColonnaExtra = "telefono" | "email" | "punteggio" | "arrivato" | "tentativi" | "proposta";
export type Filtri = {
  seg: Segmento; fasi: string[]; resp: string; camp: string; q: string;
  // "oggi": solo le scadenze entro oggi (scadute comprese), lo stesso insieme della lista di Oggi.
  scad: "" | "oggi";
  ord: Ordine; dir: "asc" | "desc"; col: ColonnaExtra[];
};

export const SEGMENTI: { id: Segmento; etichetta: string }[] = [
  { id: "aperti", etichetta: "Aperti" },
  { id: "scaduti", etichetta: "Scaduti" },
  { id: "chiusi", etichetta: "Chiusi" },
];
export const COLONNE_EXTRA: { id: ColonnaExtra; etichetta: string }[] = [
  { id: "telefono", etichetta: "Telefono" },
  { id: "email", etichetta: "Email" },
  { id: "punteggio", etichetta: "Punteggio" },
  { id: "arrivato", etichetta: "Arrivato il" },
  { id: "tentativi", etichetta: "Tentativi" },
  { id: "proposta", etichetta: "Proposta" },
];
// Responsabile non assegnato: valore del filtro (nell'indirizzo "resp=nessuno").
export const NESSUNO = "nessuno";

export const FILTRI_BASE: Filtri = { seg: "aperti", fasi: [], resp: "", camp: "", q: "", scad: "", ord: "scadenza", dir: "asc", col: [] };

const ORDINI: Ordine[] = ["azienda", "fase", "scadenza", "contatto"];
const lista = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function leggiFiltri(p: URLSearchParams): Filtri {
  const seg = p.get("seg");
  const ord = p.get("ord");
  return {
    seg: seg === "scaduti" || seg === "chiusi" ? seg : "aperti",
    fasi: lista(p.get("fase")),
    resp: p.get("resp") ?? "",
    camp: p.get("camp") ?? "",
    q: p.get("q") ?? "",
    scad: p.get("scad") === "oggi" ? "oggi" : "",
    ord: ORDINI.includes(ord as Ordine) ? (ord as Ordine) : "scadenza",
    dir: p.get("dir") === "desc" ? "desc" : "asc",
    col: lista(p.get("col")).filter((c): c is ColonnaExtra => COLONNE_EXTRA.some((x) => x.id === c)),
  };
}

// Solo i valori diversi dal default finiscono nell'indirizzo: /commerciale/lead resta pulito.
export function scriviFiltri(f: Filtri): URLSearchParams {
  const p = new URLSearchParams();
  if (f.seg !== "aperti") p.set("seg", f.seg);
  if (f.fasi.length) p.set("fase", f.fasi.join(","));
  if (f.resp) p.set("resp", f.resp);
  if (f.camp) p.set("camp", f.camp);
  if (f.q) p.set("q", f.q);
  if (f.scad) p.set("scad", f.scad);
  if (f.ord !== "scadenza" || f.dir !== "asc") { p.set("ord", f.ord); p.set("dir", f.dir); }
  if (f.col.length) p.set("col", f.col.join(","));
  return p;
}

// Il numero sul pulsante "Filtri" del telefono: fase, responsabile, campagna e scadenza (segmento e ricerca si vedono già).
export const quantiFiltri = (f: Filtri) => [f.fasi.length > 0, !!f.resp, !!f.camp, !!f.scad].filter(Boolean).length;

const APERTE = new Set(FASI_APERTE);
export const aperto = (l: Pick<LeadListItem, "stageId">) => APERTE.has(l.stageId);

export function nelSegmento(l: RigaLead, seg: Segmento): boolean {
  if (seg === "chiusi") return !aperto(l);
  if (!aperto(l)) return false;
  return seg === "aperti" || l.prossima?.stato === "scaduto";
}

const cifre = (s: string) => s.replace(/\D/g, "");

// Ricerca su azienda, persona, telefono ed email. Con almeno tre cifre confronta solo le cifre del telefono,
// così "333 123" trova "+39 333 1234567".
export function trova(l: RigaLead, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if ([l.company, l.contactName, l.email, l.phone].some((v) => v?.toLowerCase().includes(t))) return true;
  const n = cifre(t);
  return n.length >= 3 && n.length === t.replace(/[\s+().-]/g, "").length && !!l.phone && cifre(l.phone).includes(n);
}

const entroOggi = (l: RigaLead) => l.prossima?.stato === "scaduto" || l.prossima?.stato === "oggi";

// Tutti i filtri tranne il segmento: servono anche ai conteggi del titolo.
function passaAltri(l: RigaLead, f: Filtri): boolean {
  if (f.fasi.length && !f.fasi.includes(l.stageId)) return false;
  if (f.resp === NESSUNO ? l.ownerId != null : f.resp && l.ownerId !== f.resp) return false;
  if (f.camp && l.metaCampaign !== f.camp) return false;
  if (f.scad === "oggi" && !entroOggi(l)) return false;
  return trova(l, f.q);
}

export const filtra = (righe: RigaLead[], f: Filtri) => righe.filter((l) => nelSegmento(l, f.seg) && passaAltri(l, f));

// Titolo "<n> lead aperti, <m> scaduti": gli stessi numeri che danno i segmenti Aperti e Scaduti con gli altri filtri.
export function conteggi(righe: RigaLead[], f: Filtri) {
  const altri = righe.filter((l) => passaAltri(l, f));
  return { aperti: altri.filter((l) => nelSegmento(l, "aperti")).length, scaduti: altri.filter((l) => nelSegmento(l, "scaduti")).length };
}

export const titoloLead = (n: { aperti: number; scaduti: number }) =>
  `${n.aperti} ${n.aperti === 1 ? "lead aperto" : "lead aperti"}, ${n.scaduti} ${n.scaduti === 1 ? "scaduto" : "scaduti"}`;

// Ordine di default: scadenza crescente (prima i più scaduti), poi fase. Senza scadenza (chiusi) in fondo,
// dal cambio di fase più recente. Il clic sull'intestazione ordina per Azienda, Fase, Scadenza, Ultimo contatto.
export function ordina(righe: RigaLead[], f: Pick<Filtri, "ord" | "dir">, fasi: Stage[]): RigaLead[] {
  const posto = new Map(fasi.map((s) => [s.id, s.sortOrder]));
  const fase = (a: RigaLead, b: RigaLead) => (posto.get(a.stageId) ?? 999) - (posto.get(b.stageId) ?? 999);
  const verso = f.dir === "desc" ? -1 : 1;
  const conValore = (va: number | null | undefined, vb: number | null | undefined) =>
    va == null && vb == null ? 0 : va == null ? 1 : vb == null ? -1 : verso * (va - vb);
  const confronto = (a: RigaLead, b: RigaLead): number => {
    switch (f.ord) {
      case "azienda": return verso * a.company.localeCompare(b.company, "it", { sensitivity: "base" });
      case "fase": return verso * fase(a, b) || conValore(a.prossima?.scadenza, b.prossima?.scadenza);
      case "contatto": return conValore(a.ultimoContatto, b.ultimoContatto);
      default: return conValore(a.prossima?.scadenza, b.prossima?.scadenza) || fase(a, b) || b.stageChangedAt - a.stageChangedAt;
    }
  };
  return [...righe].sort((a, b) => confronto(a, b) || a.company.localeCompare(b.company, "it"));
}

// Le campagne Meta dei lead, per il filtro Campagna (in ordine alfabetico).
export const campagne = (righe: RigaLead[]) =>
  [...new Set(righe.map((l) => l.metaCampaign).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "it"));

// Fasi offerte dal filtro: quelle del segmento (aperte per Aperti e Scaduti, chiuse per Chiusi), nell'ordine del processo.
export const fasiDelSegmento = (fasi: Stage[], seg: Segmento) =>
  [...fasi].sort((a, b) => a.sortOrder - b.sortOrder).filter((s) => (seg === "chiusi" ? !APERTE.has(s.id) : APERTE.has(s.id)));

const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const due = (n: number) => String(n).padStart(2, "0");
const numeroGiorno = (p: { anno: number; mese: number; giorno: number }) => Math.round(Date.UTC(p.anno, p.mese - 1, p.giorno) / 86_400_000);

// Scadenza corta per la colonna da 11% e la riga del telefono: "scaduta da 2 g", "ieri 18:00", "oggi 15:00",
// "domani 10:00", "gio 30 ott". "Scaduta" solo per lo stato scaduto (oltre un giorno di ritardo, la riga rossa):
// una scadenza di stamattina è ancora "oggi 08:30", così la parola non contraddice il segmento Scaduti.
export function scadenzaBreve(ms: number, ora: number, stato?: ProssimaAzione["stato"]): string {
  if (stato === "scaduto" && ms < ora) {
    const d = ora - ms;
    const n = d < 86_400_000 ? `${Math.max(1, Math.floor(d / 3_600_000))} h` : `${Math.floor(d / 86_400_000)} g`;
    return `scaduta da ${n}`;
  }
  const p = partiRoma(ms);
  const diff = numeroGiorno(p) - numeroGiorno(partiRoma(ora));
  const orario = `${due(p.ore)}:${due(p.minuti)}`;
  if (diff === 0) return `oggi ${orario}`;
  if (diff === 1) return `domani ${orario}`;
  if (diff === -1) return `ieri ${orario}`;
  return `${GIORNI_BREVI[p.settimana]} ${p.giorno} ${MESI_BREVI[p.mese - 1]}`;
}
