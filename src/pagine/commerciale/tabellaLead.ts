import { FASI_APERTE } from "../../../worker/processo/processo";
import { daRoma, partiRoma } from "../../../worker/lib/roma";
import type { LeadListItem, ProssimaAzione, Stage } from "../../types";

// Logica della tabella dei lead (contratto blocco 1, sezione 4): filtri letti e scritti nell'indirizzo, segmento,
// ricerca, ordinamento, conteggi del titolo ed esportazione. Funzioni pure: la pagina le usa, le prove le chiamano.

// Riga della tabella: il lead di GET /api/leads con la riga "Da fare" della funzione unica e l'ultimo contatto.
export type RigaLead = LeadListItem & { prossima?: ProssimaAzione; ultimoContatto?: number | null };

export type Segmento = "aperti" | "scaduti" | "chiusi";
export type Ordine = "azienda" | "fase" | "scadenza" | "contatto" | "arrivo";
export type Filtri = {
  seg: Segmento; fasi: string[]; resp: string; camp: string; q: string;
  // "oggi": solo le scadenze entro oggi (scadute comprese), lo stesso insieme della lista di Oggi.
  scad: "" | "oggi";
  // Filtro "Arrivati" sulla data di arrivo (createdAt); con "periodo" valgono dal e al ("AAAA-MM-GG", giorni di Roma interi).
  arr: Arrivo; dal: string; al: string;
  ord: Ordine; dir: "asc" | "desc";
};

export type Arrivo = "" | "oggi" | "ieri" | "7g" | "30g" | "mese" | "mese-scorso" | "periodo";
export const ARRIVI: { id: Exclude<Arrivo, "">; etichetta: string }[] = [
  { id: "oggi", etichetta: "Oggi" },
  { id: "ieri", etichetta: "Ieri" },
  { id: "7g", etichetta: "Ultimi 7 giorni" },
  { id: "30g", etichetta: "Ultimi 30 giorni" },
  { id: "mese", etichetta: "Questo mese" },
  { id: "mese-scorso", etichetta: "Mese scorso" },
  { id: "periodo", etichetta: "Periodo..." },
];
const ID_ARRIVI = new Set<string>(ARRIVI.map((a) => a.id));
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const giornoDa = (s: string) => DATA.test(s) ? s.split("-").map(Number) as [number, number, number] : null;

// Intervallo [da, a) in ms degli arrivi, sul calendario di Roma; null = nessun limite. "Ultimi 7 giorni" è oggi
// più i sei giorni prima; il periodo prende interi i giorni "dal" e "al" (anche uno solo dei due, o invertiti).
export function intervalloArrivo(f: Pick<Filtri, "arr" | "dal" | "al">, ora: number): { da: number | null; a: number | null } | null {
  if (!f.arr) return null;
  const { anno, mese, giorno } = partiRoma(ora);
  const g = (n: number) => daRoma(anno, mese, giorno + n);
  switch (f.arr) {
    case "oggi": return { da: g(0), a: g(1) };
    case "ieri": return { da: g(-1), a: g(0) };
    case "7g": return { da: g(-6), a: g(1) };
    case "30g": return { da: g(-29), a: g(1) };
    case "mese": return { da: daRoma(anno, mese, 1), a: daRoma(anno, mese + 1, 1) };
    case "mese-scorso": return { da: daRoma(anno, mese - 1, 1), a: daRoma(anno, mese, 1) };
    case "periodo": {
      let [dal, al] = [giornoDa(f.dal), giornoDa(f.al)];
      if (dal && al && f.dal > f.al) [dal, al] = [al, dal];
      if (!dal && !al) return null;
      return { da: dal ? daRoma(dal[0], dal[1], dal[2]) : null, a: al ? daRoma(al[0], al[1], al[2] + 1) : null };
    }
  }
}

export const arrivatoNel = (ms: number, i: ReturnType<typeof intervalloArrivo>) =>
  !i || ((i.da == null || ms >= i.da) && (i.a == null || ms < i.a));

// Testo del filtro chiuso: "Ultimi 7 giorni", "dal 01/10 al 15/10", "dal 01/10", "fino al 15/10".
export function etichettaArrivo(f: Pick<Filtri, "arr" | "dal" | "al">): string {
  if (!f.arr) return "Sempre";
  if (f.arr !== "periodo") return ARRIVI.find((a) => a.id === f.arr)!.etichetta;
  const breve = (s: string) => { const d = giornoDa(s); return d ? `${String(d[2]).padStart(2, "0")}/${String(d[1]).padStart(2, "0")}` : ""; };
  const [dal, al] = f.dal && f.al && f.dal > f.al ? [f.al, f.dal] : [f.dal, f.al];
  if (breve(dal) && breve(al)) return `dal ${breve(dal)} al ${breve(al)}`;
  if (breve(dal)) return `dal ${breve(dal)}`;
  if (breve(al)) return `fino al ${breve(al)}`;
  return "Periodo";
}

export const SEGMENTI: { id: Segmento; etichetta: string }[] = [
  { id: "aperti", etichetta: "Aperti" },
  { id: "scaduti", etichetta: "Scaduti" },
  { id: "chiusi", etichetta: "Chiusi" },
];
// Responsabile non assegnato: valore del filtro (nell'indirizzo "resp=nessuno").
export const NESSUNO = "nessuno";

export const FILTRI_BASE: Filtri = { seg: "aperti", fasi: [], resp: "", camp: "", q: "", scad: "", arr: "", dal: "", al: "", ord: "scadenza", dir: "asc" };

const ORDINI: Ordine[] = ["azienda", "fase", "scadenza", "contatto", "arrivo"];

// Verso dopo un clic sull'intestazione: sulla colonna già attiva si inverte; su una colonna nuova "Arrivato il"
// parte dal più recente (desc), le altre dal crescente (A-Z, fase più bassa, scadenza più vicina).
export const versoAlClic = (f: Pick<Filtri, "ord" | "dir">, o: Ordine): Filtri["dir"] =>
  f.ord === o ? (f.dir === "asc" ? "desc" : "asc") : o === "arrivo" ? "desc" : "asc";
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
    arr: ID_ARRIVI.has(p.get("arr") ?? "") ? (p.get("arr") as Arrivo) : "",
    dal: p.get("arr") === "periodo" && DATA.test(p.get("dal") ?? "") ? p.get("dal")! : "",
    al: p.get("arr") === "periodo" && DATA.test(p.get("al") ?? "") ? p.get("al")! : "",
    ord: ORDINI.includes(ord as Ordine) ? (ord as Ordine) : "scadenza",
    dir: p.get("dir") === "desc" ? "desc" : "asc",
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
  if (f.arr) p.set("arr", f.arr);
  if (f.arr === "periodo" && f.dal) p.set("dal", f.dal);
  if (f.arr === "periodo" && f.al) p.set("al", f.al);
  if (f.ord !== "scadenza" || f.dir !== "asc") { p.set("ord", f.ord); p.set("dir", f.dir); }
  return p;
}

// Il numero sul pulsante "Filtri" del telefono: fase, responsabile, campagna, scadenza e arrivo (segmento e ricerca si vedono già).
export const quantiFiltri = (f: Filtri) => [f.fasi.length > 0, !!f.resp, !!f.camp, !!f.scad, !!f.arr].filter(Boolean).length;

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

// Tutti i filtri tranne il segmento: servono anche ai conteggi del titolo. "ora" serve agli arrivi relativi (oggi, 7 giorni...).
function passaAltri(l: RigaLead, f: Filtri, ora: number): boolean {
  if (f.fasi.length && !f.fasi.includes(l.stageId)) return false;
  if (f.resp === NESSUNO ? l.ownerId != null : f.resp && l.ownerId !== f.resp) return false;
  if (f.camp && l.metaCampaign !== f.camp) return false;
  if (f.scad === "oggi" && !entroOggi(l)) return false;
  if (f.arr && !arrivatoNel(l.createdAt, intervalloArrivo(f, ora))) return false;
  return trova(l, f.q);
}

export const filtra = (righe: RigaLead[], f: Filtri, ora = Date.now()) => righe.filter((l) => nelSegmento(l, f.seg) && passaAltri(l, f, ora));

// Titolo "<n> lead aperti, <m> scaduti": gli stessi numeri che danno i segmenti Aperti e Scaduti con gli altri filtri.
export function conteggi(righe: RigaLead[], f: Filtri, ora = Date.now()) {
  const altri = righe.filter((l) => passaAltri(l, f, ora));
  return { aperti: altri.filter((l) => nelSegmento(l, "aperti")).length, scaduti: altri.filter((l) => nelSegmento(l, "scaduti")).length };
}

export const titoloLead = (n: { aperti: number; scaduti: number }) =>
  `${n.aperti} ${n.aperti === 1 ? "lead aperto" : "lead aperti"}, ${n.scaduti} ${n.scaduti === 1 ? "scaduto" : "scaduti"}`;

// Ordine di default: scadenza crescente (prima i più scaduti), poi fase. Senza scadenza (chiusi) in fondo,
// dal cambio di fase più recente. Il clic sull'intestazione ordina per Azienda (poi referente), Fase (poi scadenza),
// Scadenza, Ultimo contatto e Arrivato il (createdAt completo, data e ora).
export function ordina(righe: RigaLead[], f: Pick<Filtri, "ord" | "dir">, fasi: Stage[]): RigaLead[] {
  const posto = new Map(fasi.map((s) => [s.id, s.sortOrder]));
  const fase = (a: RigaLead, b: RigaLead) => (posto.get(a.stageId) ?? 999) - (posto.get(b.stageId) ?? 999);
  const verso = f.dir === "desc" ? -1 : 1;
  const conValore = (va: number | null | undefined, vb: number | null | undefined) =>
    va == null && vb == null ? 0 : va == null ? 1 : vb == null ? -1 : verso * (va - vb);
  // Referente a parità di azienda: nello stesso verso, senza nome in fondo.
  const referente = (a: RigaLead, b: RigaLead) =>
    !a.contactName && !b.contactName ? 0 : !a.contactName ? 1 : !b.contactName ? -1 : verso * a.contactName.localeCompare(b.contactName, "it", { sensitivity: "base" });
  const confronto = (a: RigaLead, b: RigaLead): number => {
    switch (f.ord) {
      case "azienda": return verso * a.company.localeCompare(b.company, "it", { sensitivity: "base" }) || referente(a, b);
      case "fase": return verso * fase(a, b) || conValore(a.prossima?.scadenza, b.prossima?.scadenza);
      case "contatto": return conValore(a.ultimoContatto, b.ultimoContatto);
      case "arrivo": return conValore(a.createdAt, b.createdAt);
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
// Giorni di calendario (a Roma) tra la scadenza e oggi: -1 ieri, 0 oggi, 1 domani.
export const giorniDaOggi = (ms: number, ora: number) => numeroGiorno(partiRoma(ms)) - numeroGiorno(partiRoma(ora));

export function scadenzaBreve(ms: number, ora: number, stato?: ProssimaAzione["stato"]): string {
  if (stato === "scaduto" && ms < ora) {
    const d = ora - ms;
    const ore = Math.max(1, Math.floor(d / 3_600_000)), giorni = Math.floor(d / 86_400_000);
    const n = d < 86_400_000 ? (ore === 1 ? "1 ora" : `${ore} ore`) : giorni === 1 ? "1 giorno" : `${giorni} giorni`;
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
