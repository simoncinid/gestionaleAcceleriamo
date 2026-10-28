import { describe, expect, it } from "vitest";
import { EtichettaFase, faseDi, tintaFase } from "../src/pagine/commerciale/EtichettaFase";
import { classeScadenza } from "../src/pagine/commerciale/coloriLead";
import { scadenzaBreve } from "../src/pagine/commerciale/tabellaLead";
import { FASI } from "./b1c-fixture";
import { render } from "./render";

// Blocco 1 bis: la fase è un'etichetta colorata dal tono della tabella stages, alta 24 px, senza pallino.
describe("blocco 1 bis: etichetta della fase", () => {
  it("un colore per famiglia di fase, testo scuro, bordo, niente pallino", () => {
    expect(tintaFase("orange")).toContain("bg-[#FCE4DA]");
    expect(tintaFase("blue")).not.toBe(tintaFase("orange"));
    expect(tintaFase("sconosciuto")).toBe(tintaFase("neutral"));
    const html = render(<EtichettaFase label="Da richiamare" tone="orange" freccia />);
    expect(html).toContain("h-6");
    expect(html).toContain("text-ink");
    expect(html).toContain("border");
    expect(html).toContain("Da richiamare");
    expect(html).toContain("<svg"); // la freccia per cambiare fase
    expect(html).not.toContain("rounded-full");
  });

  it("nome e tono dall'elenco delle fasi; fase sconosciuta in grigio con l'id", () => {
    const fasi = FASI.map((f) => (f.id === "da-richiamare" ? { ...f, tone: "orange" } : f));
    expect(faseDi(fasi, "da-richiamare")).toEqual({ label: "Da richiamare", tone: "orange" });
    expect(faseDi(fasi, "boh")).toEqual({ label: "boh", tone: "neutral" });
  });

  it("scadenza sotto l'azione: scaduta da 2 giorni e ieri in rosso, oggi in arancio scuro, domani normale", () => {
    const ora = Date.UTC(2026, 9, 28, 9, 0); // 11:00 a Roma
    expect(scadenzaBreve(ora - 2 * 86_400_000 - 1000, ora, "scaduto")).toBe("scaduta da 2 giorni");
    const ieri = Date.UTC(2026, 9, 27, 15, 45);
    expect(scadenzaBreve(ieri, ora, "oggi")).toBe("ieri 16:45");
    expect(classeScadenza("oggi", ieri, ora)).toContain("#B42318");
    expect(classeScadenza("oggi", ora + 3_600_000, ora)).toContain("text-accento-testo");
    expect(classeScadenza("futuro", ora + 86_400_000, ora)).toBe("text-grigio");
  });
});

describe("blocco 1 bis: colonne del foglio CRM LEAD", async () => {
  const c = await import("../src/pagine/commerciale/colonneLead");
  it("scelta salvata: si scartano le voci sconosciute, le fisse ci sono sempre, l'ordine è quello della tabella", () => {
    expect(c.leggiColonne(null)).toEqual(c.VISIBILI_BASE);
    expect(c.leggiColonne("rotto")).toEqual(c.VISIBILI_BASE);
    expect(c.leggiColonne(JSON.stringify(["fonte", "boh", "email"]))).toEqual(["azienda", "fase", "dafare", "email", "fonte"]);
    expect(c.COLONNE).toHaveLength(12);
    expect(c.VISIBILI_BASE).toHaveLength(6);
    // Seconda passata: Responsabile non è più una colonna; una scelta vecchia che lo conteneva lo perde.
    expect(c.COLONNE.map((x) => x.titolo)).not.toContain("Responsabile");
    expect(c.leggiColonne(JSON.stringify(["responsabile", "email"]))).toEqual(["azienda", "fase", "dafare", "email"]);
  });
  it("inserzione accorciata, risposte del modulo leggibili, offerta e data brevi", () => {
    expect(c.inserzioneBreve("Lavoro ripetuto video 3.mp4 copia 2")).toBe("Lavoro ripetuto video 3");
    expect(c.inserzioneBreve("Campagna autunno con un nome davvero molto lungo")).toBe("Campagna autunno con un nome dav…");
    const meta = JSON.stringify({ "in_che_settore_opera_la_tua_azienda?": "edilizia", "quale_di_queste_attività_ti_fa_perdere_più_tempo_oggi?": "fare_i_preventivi" });
    expect(c.settoreDi({ metaAnswers: meta })).toBe("Edilizia");
    expect(c.attivitaDi({ metaAnswers: meta })).toBe("Fare i preventivi");
    const foglio = JSON.stringify({ "In che settore opera la tua azienda?": "Ristorazione" });
    expect(c.settoreDi({ metaAnswers: foglio })).toBe("Ristorazione");
    expect(c.attivitaDi({ metaAnswers: foglio })).toBe("");
    expect(c.offertaBreve(150_000, 15_000)).toBe("1.500 € + 150/mese");
    expect(c.offertaBreve(null, 15_000)).toBe("150/mese");
    expect(c.offertaBreve(null, null)).toBe("");
    expect(c.arrivatoBreve(Date.UTC(2026, 9, 21, 10), Date.UTC(2026, 9, 28, 10))).toBe("21/10");
  });
});
