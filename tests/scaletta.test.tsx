import { describe, expect, it } from "vitest";
import { FoglioFiltri } from "../src/pagine/commerciale/FoglioFiltri";
import { Scaletta } from "../src/pagine/commerciale/Scaletta";
import { FILTRI_VUOTI, TUTTE, applicaCerca, sopratitolo, filtriAttivi, listaTelefono, opzioniFase, parametri, perFase, totali } from "../src/pagine/commerciale/filtriScaletta";
import type { LeadListItem, Stage } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const fase = (id: string, label: string, sortOrder: number, kind: Stage["kind"] = "open"): Stage =>
  ({ id, label, sortOrder, kind, tone: "neutro", probability: 10, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: kind === "lost" });
const FASI = [fase("da-chiamare-prima-volta", "Da chiamare", 10), fase("da-richiamare", "Da richiamare", 30), fase("chiuso", "Chiuso", 90, "won")];
const lead = (id: string, stageId: string, setup: number | null, fee: number | null): LeadListItem => ({
  id, company: `Officina ${id}`, contactName: "Luca Prova", email: null, phone: "+393330000001", source: "meta", metaCampaign: null, metaStatus: null,
  stageId, stageChangedAt: ORA, estimatedValue: null, ownerId: null, nextAction: "Richiamare", nextActionAt: ORA + 1000, appointmentAt: null,
  duplicateOfId: null, createdAt: ORA, updatedAt: ORA, deletedAt: null, attemptCount: 0, score: null, setupCents: setup, feeCents: fee, sequenceStep: 0,
});
const LEADS = [lead("a", "da-richiamare", 200_000, 30_000), lead("b", "da-richiamare", null, 15_000), lead("c", "da-chiamare-prima-volta", null, null), lead("z", "chiuso", 100_000, 10_000)];

describe("Scaletta, logica", () => {
  it("parametri senza campi vuoti", () => {
    expect(parametri(FILTRI_VUOTI)).toBe("");
    expect(parametri({ ...FILTRI_VUOTI, source: "foglio_andrea", score: "verde" }, { vista: "nuovi" })).toBe("source=foglio_andrea&score=verde&vista=nuovi");
  });
  it("raggruppa per fase e somma setup e canone", () => {
    expect(perFase(LEADS).get("da-richiamare")?.map((l) => l.id)).toEqual(["a", "b"]);
    expect(totali(perFase(LEADS).get("da-richiamare")!)).toEqual({ setupCents: 200_000, feeCents: 45_000 });
  });
  it("PV5: il selettore della fase ha Tutte e tutte le fasi, Chiuso compreso, con i conteggi", () => {
    const o = opzioniFase(FASI, perFase(LEADS));
    expect(o.map((x) => x.etichetta)).toEqual(["Tutte", "Da chiamare", "Da richiamare", "Chiuso"]);
    expect(o.map((x) => x.meta)).toEqual(["3", "1", "2", "1"]);
  });
  it("Tutte mostra i lead aperti nell'ordine delle fasi, una fase mostra solo i suoi", () => {
    const g = perFase(LEADS);
    expect(listaTelefono(TUTTE, FASI, g).map((l) => l.id)).toEqual(["c", "a", "b"]);
    expect(listaTelefono("chiuso", FASI, g).map((l) => l.id)).toEqual(["z"]);
  });
  it("sopratitolo: lead aperti con Tutte, N in questa fase con una fase scelta", () => {
    const n = { aperti: 14, fase: 4, vista: 7 };
    expect(sopratitolo("colonne", TUTTE, n)).toBe("14 lead aperti");
    expect(sopratitolo("colonne", "da-richiamare", n)).toBe("4 in questa fase");
    expect(sopratitolo("elenco", "da-richiamare", n)).toBe("7 lead in questa vista");
  });
  it("filtri attivi senza contare la ricerca", () => {
    expect(filtriAttivi({ ...FILTRI_VUOTI, q: "bertini" })).toBe(false);
    expect(filtriAttivi({ ...FILTRI_VUOTI, da: ORA })).toBe(true);
  });
  it("PV6: ?cerca=1 mette il fuoco sulla ricerca e toglie il parametro", () => {
    let fuoco = 0;
    let rimasti: string | null = null;
    const campo = { focus: () => { fuoco++; } };
    expect(applicaCerca(new URLSearchParams("cerca=1&x=2"), campo, (p) => { rimasti = p.toString(); })).toBe(true);
    expect(fuoco).toBe(1);
    expect(rimasti).toBe("x=2");
    expect(applicaCerca(new URLSearchParams("x=2"), campo, () => { throw new Error("non deve sostituire"); })).toBe(false);
    expect(fuoco).toBe(1);
  });
});

describe("Scaletta, pagina", () => {
  it("selettore della fase sul telefono, conteggi e totali in testa alla colonna, nessun primario in testata", () => {
    const html = render(<Scaletta ora={ORA} />, { percorso: "/commerciale/scaletta", dati: [[["stages"], FASI], [["leads", ""], LEADS]] });
    expect(html).toContain('data-selettore="Fase"');
    // Il selettore parte da "Tutte" (prototipo 10-scaletta, spec 6.5).
    expect(html).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>).)*>Tutte</s);
    expect(html).toMatch(/Da richiamare<\/span>(?:<!-- -->)? <span class="shrink-0 text-grigio tabular-nums">2<\/span>/);
    expect(html).not.toContain("<select");
    // Le colonne del computer sono solo le fasi aperte.
    expect(html).not.toMatch(/>Chiuso</);
    expect(html).toContain("€ 2.000 | € 450");
    expect(html).toContain("3 lead aperti");
    expect(contaPrimari(html)).toBe(0);
  });

  it("PV6: le azioni rapide avvolgono la card", () => {
    const html = render(<Scaletta ora={ORA} />, { percorso: "/commerciale/scaletta", dati: [[["stages"], FASI], [["leads", ""], LEADS]] });
    expect(html).toMatch(/data-menu-rapido="a"[^>]*>\s*<a [^>]*href="\/commerciale\/lead\/a"/);
    expect(html).toContain('aria-label="Azioni rapide su Officina a"');
  });

  it("PV6: con ?cerca=1 il campo di ricerca è visibile, senza resta chiuso", () => {
    const dati: [unknown[], unknown][] = [[["stages"], FASI], [["leads", ""], LEADS]];
    expect(render(<Scaletta ora={ORA} />, { percorso: "/commerciale/scaletta?cerca=1", dati })).toContain('type="search"');
    expect(render(<Scaletta ora={ORA} />, { percorso: "/commerciale/scaletta", dati })).not.toContain('type="search"');
  });

  it("le campagne dei Filtri vengono dall'elenco senza filtri", () => {
    const conCampagna = (id: string, c: string) => ({ ...lead(id, "da-richiamare", null, null), metaCampaign: c });
    const html = render(<FoglioFiltri filtri={{ ...FILTRI_VUOTI, campaign: "Agenda online" }} onApplica={() => {}} onChiudi={() => {}} />,
      { dati: [[["leads", ""], [conCampagna("x", "Automazione preventivi"), conCampagna("y", "Agenda online")]], [["leads", "campaign=Agenda+online"], [conCampagna("y", "Agenda online")]]] });
    // Il selettore chiuso mostra la campagna scelta solo se è tra le opzioni, che arrivano dalla chiave senza filtri.
    expect(html).toMatch(/data-selettore="Campagna"(?:(?!<\/button>).)*>Agenda online</s);
  });

  it("stato vuoto senza lead", () => {
    const html = render(<Scaletta ora={ORA} />, { percorso: "/commerciale/scaletta", dati: [[["stages"], FASI], [["leads", ""], []]] });
    expect(html).toContain("Nessun lead con questi filtri");
  });
});
