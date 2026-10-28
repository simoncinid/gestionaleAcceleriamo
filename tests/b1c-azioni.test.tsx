import { describe, expect, it, vi } from "vitest";
import { scegliFase, type FoglioRiga } from "../src/pagine/commerciale/AzioniLead";
import { Lead } from "../src/pagine/commerciale/Lead";
import { FASI, ORA, riga } from "./b1c-fixture";
import { render } from "./render";

const fase = (id: string) => FASI.find((f) => f.id === id)!;
const prova = (da: string, a: string) => {
  const apri = vi.fn<(f: FoglioRiga) => void>();
  const sposta = vi.fn<(id: string) => void>();
  scegliFase(riga("x", { stageId: da }), fase(a), apri, sposta);
  return { foglio: apri.mock.calls[0]?.[0], sposta: sposta.mock.calls[0]?.[0] };
};

describe("modifica 20: azioni dalla tabella", () => {
  it("Consulenza fissata e Presentazione fissata dalla cella aprono il foglio della call, non cambiano la fase", () => {
    for (const id of ["appuntamento-confermato", "presentazione-confermata"]) {
      const r = prova("da-richiamare", id);
      expect(r.foglio).toMatchObject({ tipo: "fase", fase: { id } });
      expect(r.sposta).toBeUndefined();
    }
  });

  it("Non interessato chiede il motivo, Cliente chiede i dati: foglio, niente cambio diretto", () => {
    expect(prova("in-attesa-decisione", "non-chiuso").foglio).toMatchObject({ tipo: "fase", fase: { id: "non-chiuso" } });
    expect(prova("in-attesa-decisione", "chiuso").foglio).toMatchObject({ tipo: "fase", fase: { id: "chiuso" } });
    expect(prova("in-attesa-decisione", "non-chiuso").sposta).toBeUndefined();
  });

  it("le altre fasi cambiano subito (con Annulla nel toast); la stessa fase non fa niente", () => {
    expect(prova("da-chiamare-prima-volta", "da-richiamare")).toEqual({ foglio: undefined, sposta: "da-richiamare" });
    expect(prova("da-richiamare", "da-richiamare")).toEqual({ foglio: undefined, sposta: undefined });
  });

  it("riga: cella Fase che si apre e menu; niente icone di telefono e WhatsApp (seconda passata, stanno nella scheda)", () => {
    const html = render(<Lead ora={ORA} />, {
      percorso: "/commerciale/lead",
      dati: [[["leads", "tabella"], [riga("a"), riga("b", { phone: null })]], [["stages"], FASI], [["users"], [{ id: "tommaso", name: "Tommaso" }]], [["modelli"], []]],
    });
    expect(html).toContain('aria-label="Fase di Officina a: Da richiamare. Cambia"');
    expect(html).toContain('aria-label="Altre azioni per Officina a"');
    expect(html).not.toContain("https://wa.me/");
    expect(html).not.toContain('aria-label="Chiama ');
    expect(html).not.toContain('aria-label="WhatsApp a ');
    // La cella Azioni tiene solo il menu: colonna da 44 px.
    expect(html).toContain('<col style="width:44px"/>');
  });
});
