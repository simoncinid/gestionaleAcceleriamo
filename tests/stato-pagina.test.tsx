import { describe, expect, it } from "vitest";
import { ePassoRotto } from "../src/pagine/automazioni/Flusso";
import { StatoAutomazioni } from "../src/pagine/automazioni/Stato";
import type { VoceStato } from "../worker/stato/routes";
import type { AutomationStep } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 22, 8, 0);
const voce = (o: Partial<VoceStato>): VoceStato => ({
  id: "v", tipo: "interno", nome: "Lead dal foglio di Andrea", proprietario: "Acceleriamo", clientId: null, automationId: null, automazione: null,
  intervalloMin: 5, attiva: true, colore: "verde", ultimoEsito: "ok", ultimoGiroAt: ORA - 60_000, ultimoOkAt: ORA - 60_000, ultimoErroreAt: null,
  ultimoErrore: null, ultimoPasso: null, prossimoAt: ORA + 240_000, ...o,
});
const voci = [
  voce({ id: "m", tipo: "esterno", nome: "Megaron, giri dei tecnici", proprietario: "Megaron Immobiliare", colore: "rosso", ultimoEsito: "errore", ultimoErrore: "Gmail non risponde", ultimoPasso: "Lettura delle email" }),
  voce({ id: "giro:foglio" }),
  voce({ id: "giro:meta_recupero", nome: "Lead Meta: recupero ogni 15 minuti", colore: "grigio", ultimoEsito: "spento", prossimoAt: null }),
];

describe("pagina Stato", () => {
  it("prima le voci da guardare, un'informazione per riga, una sola azione primaria, niente lineette", () => {
    const html = render(<StatoAutomazioni ora={ORA} />, { dati: [[["stato"], voci]] });
    expect(contaPrimari(html)).toBe(1);
    expect(html.indexOf("Megaron, giri dei tecnici")).toBeLessThan(html.indexOf("Lead dal foglio di Andrea"));
    expect(html).toContain("Megaron Immobiliare");
    expect(html).toContain("Gmail non risponde");
    expect(html).toContain("Dove: Lettura delle email");
    expect(html).toContain("1 in errore");
    expect(html).toContain("Spente o mai partite, 1");
    expect(html).toMatch(/Ultimo giro riuscito oggi/);
    expect(html).not.toMatch(/[—–]/);
  });

  it("senza voci rotte dice che non c'è niente da guardare", () => {
    const html = render(<StatoAutomazioni ora={ORA} />, { dati: [[["stato"], [voce({})]]] });
    expect(html).toContain("Niente da guardare");
  });

  it("il passo del battito riconosce il passaggio per sigla o per titolo", () => {
    const p = { id: "s1", title: "Lettura delle email" } as AutomationStep;
    expect(ePassoRotto("lettura delle email", p, "2")).toBe(true);
    expect(ePassoRotto("2", p, "2")).toBe(true);
    expect(ePassoRotto("3", p, "2")).toBe(false);
    expect(ePassoRotto(null, p, "2")).toBe(false);
  });
});
