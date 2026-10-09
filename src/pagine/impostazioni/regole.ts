import type { Opzione } from "../../ds";
import type { StageRule } from "../../types";

export type RuleKey = StageRule["ruleKey"];
export type RegolaLetta = Omit<StageRule, "params"> & { params: Record<string, number | number[]> };
export type BozzaRegola = { id: string; ruleKey: RuleKey; aggancio: string; valori: Record<string, string>; active: boolean };
type CorpoRegola = { id: string; stageId: string | null; event: string | null; params: Record<string, number | number[]>; active: boolean };

export const ETICHETTE_REGOLE: Record<RuleKey, string> = {
  sla: "Prima chiamata entro",
  tentativi: "Tentativi prima della pausa",
  preventivo_48h: "Preventivo entro",
  ricontatti: "Ricontatti dopo la proposta",
  pausa: "Pausa del lead bloccato",
  fermo: "Lead fermo dopo",
};

export const CAMPI_REGOLE: Record<RuleKey, { chiave: string; etichetta: string; lista?: boolean }[]> = {
  sla: [{ chiave: "minuti", etichetta: "Minuti" }, { chiave: "avvisoMinuti", etichetta: "Avviso dopo minuti" }],
  tentativi: [{ chiave: "massimo", etichetta: "Tentativi" }],
  preventivo_48h: [{ chiave: "ore", etichetta: "Ore" }],
  ricontatti: [{ chiave: "giorni", etichetta: "Giorni, separati da virgole", lista: true }],
  pausa: [{ chiave: "mesi", etichetta: "Mesi" }],
  fermo: [{ chiave: "giorni", etichetta: "Giorni" }],
};

export const ETICHETTE_TIPO = { open: "aperta", won: "vinta", lost: "persa" } as const;

const EVENTI: Opzione<string>[] = [{ valore: "evento:call_conoscenza_fatta", etichetta: "Dopo la call di conoscenza" }];

export const aggancioDi = (r: { stageId: string | null; event: string | null }) => (r.stageId ? `fase:${r.stageId}` : r.event ? `evento:${r.event}` : "tutte");

export function daAggancio(a: string): { stageId: string | null; event: string | null } {
  if (a.startsWith("fase:")) return { stageId: a.slice(5), event: null };
  if (a.startsWith("evento:")) return { stageId: null, event: a.slice(7) };
  return { stageId: null, event: null };
}

export const opzioniAggancio = (fasi: { id: string; label: string; kind: string }[]): Opzione<string>[] => [
  { valore: "tutte", etichetta: "Tutte le fasi aperte" },
  ...fasi.filter((f) => f.kind === "open").map((f) => ({ valore: `fase:${f.id}`, etichetta: f.label })),
  ...EVENTI,
];

export const bozzaDi = (r: RegolaLetta): BozzaRegola => ({
  id: r.id,
  ruleKey: r.ruleKey,
  aggancio: aggancioDi(r),
  active: r.active,
  valori: Object.fromEntries(CAMPI_REGOLE[r.ruleKey].map((c) => {
    const v = r.params[c.chiave];
    return [c.chiave, Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)];
  })),
});

// Dalla bozza al corpo di PUT /stage-rules. Il primo errore ferma il salvataggio con una frase in italiano.
export function corpoRegole(bozze: BozzaRegola[]): { rules: CorpoRegola[] } | { errore: string } {
  const rules: CorpoRegola[] = [];
  for (const b of bozze) {
    const params: Record<string, number | number[]> = {};
    for (const c of CAMPI_REGOLE[b.ruleKey]) {
      const testo = (b.valori[c.chiave] ?? "").trim();
      if (c.lista) {
        const numeri = testo.split(",").map((x) => Number(x.trim()));
        if (!testo || numeri.some((n) => !Number.isInteger(n) || n < 1)) return { errore: `${ETICHETTE_REGOLE[b.ruleKey]}: scrivi i giorni separati da virgole, per esempio 3, 7, 14` };
        params[c.chiave] = numeri;
      } else {
        const n = Number(testo);
        if (!testo || !Number.isInteger(n) || n < 0) return { errore: `${ETICHETTE_REGOLE[b.ruleKey]}: ${c.etichetta.toLowerCase()} deve essere un numero intero` };
        params[c.chiave] = n;
      }
    }
    rules.push({ id: b.id, ...daAggancio(b.aggancio), params, active: b.active });
  }
  return { rules };
}

// Foglio Andrea: si incolla il link intero della scheda, l'id sta tra /d/ e la barra dopo, il gid dopo "gid=".
// Senza gid vale "0", la prima scheda creata.
export const ERRORE_LINK_FOGLIO = "Questo non è il link di un Google Foglio: aprilo nel browser e copia l'indirizzo dalla barra in alto";

export function daLinkFoglio(link: string): { spreadsheetId: string; gid: string } | { errore: string } {
  const testo = link.trim();
  if (!testo) return { errore: "Incolla il link del foglio" };
  let url: URL;
  try {
    url = new URL(testo);
  } catch {
    return { errore: ERRORE_LINK_FOGLIO };
  }
  // Gli id veri sono lunghi (44 caratteri): "/d/e/..." è un foglio pubblicato sul web, che l'export non legge.
  const id = /^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:\/|$)/.exec(url.pathname)?.[1];
  if (url.hostname !== "docs.google.com" || !id) return { errore: ERRORE_LINK_FOGLIO };
  const gid = /(?:^|[#&?])gid=(\d+)/.exec(url.hash)?.[1] ?? url.searchParams.get("gid") ?? "0";
  return { spreadsheetId: id, gid: /^\d+$/.test(gid) ? gid : "0" };
}

export const linkDelFoglio = (f: { spreadsheetId: string; gid: string }) =>
  f.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${f.spreadsheetId}/edit#gid=${f.gid || "0"}` : "";

// "Leggi adesso": ripete il giro finché il foglio ha ancora righe e non c'è errore, al massimo 30 volte.
// Il cron resta com'è; qui serve per il primo caricamento di un foglio lungo.
export type Giro = { lette: number; create: number; agganciate: number; ancora: boolean; errore?: string };
export const MASSIMO_GIRI = 30;
export async function leggiFinoAllaFine(chiama: () => Promise<Giro | null>, avanzamento: (t: { lette: number; create: number }) => void) {
  const totale = { lette: 0, create: 0, agganciate: 0, giri: 0, ancora: false, errore: undefined as string | undefined };
  while (totale.giri < MASSIMO_GIRI) {
    const g = await chiama();
    totale.giri++;
    if (!g) break;
    totale.lette += g.lette;
    totale.create += g.create;
    totale.agganciate += g.agganciate;
    totale.ancora = g.ancora;
    totale.errore = g.errore;
    if (g.errore || !g.ancora) break;
    avanzamento(totale);
  }
  return totale;
}
