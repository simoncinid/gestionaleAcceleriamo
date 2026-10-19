import { describe, expect, it } from "vitest";
import { contieneParola, normalizza, scegliCampagna } from "../worker/risponditore/parola";
import type { RispCampagna } from "../worker/db/schema";

const base: RispCampagna = {
  id: "c1", nome: "Guida", parola: "guida", mediaId: null, rispostepubbliche: '["Ti scrivo!"]',
  testoPrivato: "Ciao", etichettaPulsante: "Mandami il link", risorsaSlug: "guida", testoLink: "Ecco",
  attiva: true, creataIl: 1000,
};
const camp = (o: Partial<RispCampagna>): RispCampagna => ({ ...base, ...o });

describe("normalizza", () => {
  it("minuscole, accenti tolti, simboli in spazi, spazi compattati", () => {
    expect(normalizza("  SÌ!!  Già   fatto 🙌 ")).toBe("si gia fatto");
  });
});

describe("contieneParola", () => {
  it("trova la parola intera", () => {
    expect(contieneParola("Sì", "si")).toBe(true);
    expect(contieneParola("si!", "si")).toBe(true);
    expect(contieneParola("SÌ 🙌", "si")).toBe(true);
    expect(contieneParola("casa per favore", "CASA")).toBe(true);
  });
  it("non trova parti di parola né testo vuoto", () => {
    expect(contieneParola("casale", "casa")).toBe(false);
    expect(contieneParola("", "casa")).toBe(false);
  });
  it("parola di più termini = sequenza di token", () => {
    expect(contieneParola("voglio la mia guida gratis", "la mia guida")).toBe(true);
    expect(contieneParola("la guida mia", "la mia guida")).toBe(false);
  });
  it("parola vuota non corrisponde", () => {
    expect(contieneParola("ciao", "  ")).toBe(false);
  });
});

describe("scegliCampagna", () => {
  it("preferisce la campagna del post a quella generale", () => {
    const generale = camp({ id: "gen" });
    const del_post = camp({ id: "post", mediaId: "m1" });
    expect(scegliCampagna([generale, del_post], "m1", "guida")?.id).toBe("post");
  });
  it("ignora le disattivate", () => {
    const off = camp({ id: "off", mediaId: "m1", attiva: false });
    const gen = camp({ id: "gen" });
    expect(scegliCampagna([off, gen], "m1", "guida")?.id).toBe("gen");
    expect(scegliCampagna([off], "m1", "guida")).toBeNull();
  });
  it("ignora campagne di altri post e parole diverse", () => {
    expect(scegliCampagna([camp({ mediaId: "m2" })], "m1", "guida")).toBeNull();
    expect(scegliCampagna([camp({})], "m1", "altro")).toBeNull();
  });
  it("a parità vince la più recente", () => {
    const a = camp({ id: "a", creataIl: 1 });
    const b = camp({ id: "b", creataIl: 2 });
    expect(scegliCampagna([a, b], "m1", "guida")?.id).toBe("b");
  });
});
