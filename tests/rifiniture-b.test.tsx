import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api";
import { CardLead, Errore } from "../src/ds";
import { Fasi, FoglioFase } from "../src/pagine/impostazioni/Fasi";
import { RiordinaFasi, spostaFase } from "../src/pagine/impostazioni/RiordinaFasi";
import type { Stage } from "../src/types";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { contaPrimari, render } from "./render";

const f = (id: string, kind: Stage["kind"], sortOrder: number): Stage => ({ id, label: id.toUpperCase(), sortOrder, kind, tone: "neutral", requiresReason: false, probability: 10, suggestedNextAction: null, suggestedDelayHours: null });
const FASI = [f("a", "open", 10), f("b", "open", 20), f("c", "open", 30), f("vinto", "won", 40), f("perso", "lost", 50)];

describe("Riordina", () => {
  it("sposta dentro lo stesso gruppo", () => {
    expect(spostaFase(FASI, "b", -1)).toEqual(["b", "a", "c", "vinto", "perso"]);
    expect(spostaFase(FASI, "b", 1)).toEqual(["a", "c", "b", "vinto", "perso"]);
  });
  it("non esce dal gruppo né dall'elenco", () => {
    expect(spostaFase(FASI, "c", 1)).toBeNull();
    expect(spostaFase(FASI, "a", -1)).toBeNull();
    expect(spostaFase(FASI, "vinto", 1)).toBeNull();
  });
  it("foglio: un solo primario, frecce con l'etichetta della fase", () => {
    const html = render(<RiordinaFasi fasi={FASI} onChiudi={() => {}} />, { percorso: "/impostazioni/fasi" });
    expect(html).toContain("Salva l&#x27;ordine");
    expect(html).toContain('aria-label="Sposta B più su"');
    expect(contaPrimari(html)).toBe(1);
  });
  it("pagina Fasi: pulsante Riordina secondario accanto all'elenco", () => {
    const html = render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], FASI], [["stage-rules"], []], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], []]] });
    expect(html).toContain(">Riordina<");
    expect(html).not.toContain("arriva nel Piano B");
    expect(contaPrimari(html)).toBe(1);
  });
});

describe("Fasi senza checkbox nativi", () => {
  it("regola attiva e giorni di lavoro con il DS", () => {
    const regole = [{ id: "r1", ruleKey: "sla", stageId: null, event: "lead_creato", params: { minuti: 120, avvisoMinuti: 90 }, active: true }];
    const html = render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], FASI], [["stage-rules"], regole], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], []]] });
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Giorni di lavoro");
    expect(html).toContain("lun, mar, mer, gio, ven");
  });
  it("foglio della fase: senza modifiche il salvataggio è spento", () => {
    const html = render(<FoglioFase fase={FASI[0]} onChiudi={() => {}} />);
    expect(html).toContain('aria-disabled="true"');
  });
});

describe("Card della Scaletta", () => {
  it("mostra chi segue il lead", () => {
    const html = render(<CardLead lead={{ id: "L1", company: "Officina", stageLabel: "Da richiamare", stageChangedAt: 0 }} assegnato="Diego Simoncini" />, { percorso: "/commerciale/scaletta" });
    expect(html).toContain("Segue Diego Simoncini");
  });
});

describe("Errore", () => {
  it("il codice compare una volta sola", () => {
    const e = new ApiError(500, "Errore del server (codice ab12cd34)", { error: "Errore del server", errorId: "ab12cd34" });
    const html = render(<Errore errore={e} onRiprova={() => {}} />, { percorso: "/" });
    expect(html.match(/ab12cd34/g)).toHaveLength(1);
  });
});
