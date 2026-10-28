import { describe, expect, it } from "vitest";
import { FILTRI_BASE, leggiFiltri, ordina, scriviFiltri, versoAlClic } from "../src/pagine/commerciale/tabellaLead";
import { FASI, GIORNO, ORA, ORE, riga } from "./b1c-fixture";

// Blocco 1 bis: "non posso ordinare per Arrivato il". Ordinamento per arrivo, azienda e fase.
const id = (r: { id: string }[]) => r.map((l) => l.id);

describe("blocco 1 bis: ordinamento per Arrivato il, Azienda e Fase", () => {
  it("arrivo: per data e ora complete di createdAt, desc dal più recente e asc dal più vecchio", () => {
    const righe = [
      riga("mattina", { createdAt: ORA - GIORNO }),
      riga("sera", { createdAt: ORA - GIORNO + 10 * ORE }),
      riga("vecchio", { createdAt: ORA - 5 * GIORNO }),
      riga("nuovo", { createdAt: ORA }),
    ];
    expect(id(ordina(righe, { ord: "arrivo", dir: "desc" }, FASI))).toEqual(["nuovo", "sera", "mattina", "vecchio"]);
    expect(id(ordina(righe, { ord: "arrivo", dir: "asc" }, FASI))).toEqual(["vecchio", "mattina", "sera", "nuovo"]);
  });

  it("arrivo: a parità di ora decide il nome dell'azienda", () => {
    const righe = [riga("b", { createdAt: ORA }), riga("a", { createdAt: ORA })];
    expect(id(ordina(righe, { ord: "arrivo", dir: "desc" }, FASI))).toEqual(["a", "b"]);
  });

  it("azienda: alfabetico senza badare alle maiuscole, a parità di azienda per referente", () => {
    const righe = [
      riga("z", { company: "zeta srl", contactName: "Anna" }),
      riga("a2", { company: "Alfa", contactName: "Mario" }),
      riga("a1", { company: "alfa", contactName: "Luca" }),
      riga("a0", { company: "Alfa", contactName: null }),
    ];
    expect(id(ordina(righe, { ord: "azienda", dir: "asc" }, FASI))).toEqual(["a1", "a2", "a0", "z"]);
    expect(id(ordina(righe, { ord: "azienda", dir: "desc" }, FASI))).toEqual(["z", "a2", "a1", "a0"]);
  });

  it("fase: per sort_order dalla più bassa; a parità di fase, per scadenza", () => {
    const righe = [
      riga("decisione", { stageId: "in-attesa-decisione" }),
      riga("richiamo-tardi", { stageId: "da-richiamare", scadenza: ORA + 2 * GIORNO }),
      riga("nuovo", { stageId: "da-chiamare-prima-volta" }),
      riga("richiamo-presto", { stageId: "da-richiamare", scadenza: ORA - GIORNO, stato: "scaduto" }),
    ];
    expect(id(ordina(righe, { ord: "fase", dir: "asc" }, FASI))).toEqual(["nuovo", "richiamo-presto", "richiamo-tardi", "decisione"]);
    expect(id(ordina(righe, { ord: "fase", dir: "desc" }, FASI))[0]).toBe("decisione");
  });

  it("primo clic: Arrivato il dal più recente, Azienda e Fase dalla A e dalla fase più bassa; secondo clic inverte", () => {
    expect(versoAlClic(FILTRI_BASE, "arrivo")).toBe("desc");
    expect(versoAlClic({ ...FILTRI_BASE, ord: "arrivo", dir: "desc" }, "arrivo")).toBe("asc");
    expect(versoAlClic({ ...FILTRI_BASE, ord: "arrivo", dir: "asc" }, "arrivo")).toBe("desc");
    expect(versoAlClic(FILTRI_BASE, "azienda")).toBe("asc");
    expect(versoAlClic(FILTRI_BASE, "fase")).toBe("asc");
    expect(versoAlClic({ ...FILTRI_BASE, ord: "fase", dir: "asc" }, "fase")).toBe("desc");
    // Il default resta Da fare crescente: un clic su Da fare, già attivo in asc, passa a desc.
    expect(versoAlClic(FILTRI_BASE, "scadenza")).toBe("desc");
  });

  it("indirizzo: ord=arrivo&dir=desc si legge e si riscrive; il default resta pulito", () => {
    const f = leggiFiltri(new URLSearchParams("seg=chiusi&ord=arrivo&dir=desc"));
    expect(f).toMatchObject({ seg: "chiusi", ord: "arrivo", dir: "desc" });
    expect(scriviFiltri(f).toString()).toBe("seg=chiusi&ord=arrivo&dir=desc");
    expect(scriviFiltri(FILTRI_BASE).toString()).toBe("");
    expect(leggiFiltri(new URLSearchParams("ord=telefono")).ord).toBe("scadenza");
  });
});
