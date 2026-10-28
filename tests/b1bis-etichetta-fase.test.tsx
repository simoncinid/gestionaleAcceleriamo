import { describe, expect, it } from "vitest";
import { EtichettaFase, faseDi } from "../src/pagine/commerciale/EtichettaFase";
import { classeScadenza, coloreFase } from "../src/pagine/commerciale/coloriLead";
import { scadenzaBreve } from "../src/pagine/commerciale/tabellaLead";
import { FASI } from "./b1c-fixture";
import { render } from "./render";

const FASI_DODICI = ["da-chiamare-prima-volta", "da-richiamare", "appuntamento-confermato", "in-attesa-preventivo", "presentazione-confermata",
  "analisi-fissata", "in-attesa-progetto", "progetto-fissato", "in-attesa-decisione", "chiuso", "non-chiuso", "fake"];

// Blocco 1 bis: la fase è un'etichetta colorata, alta 24 px, senza pallino.
// Seconda passata: un colore per ogni fase (dodici), scelto dall'id della fase; sfondo tinta al 18%, bordo pieno.
const contrasto = (a: string, b: string) => {
  const l = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [l(a), l(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("blocco 1 bis: etichetta della fase", () => {
  it("dodici fasi, dodici colori pieni diversi, testo leggibile (almeno 4,5:1) su ogni sfondo", () => {
    const ids = FASI_DODICI;
    const colori = ids.map((id) => coloreFase(id));
    expect(new Set(colori.map((c) => c.pieno)).size).toBe(12);
    expect(new Set(colori.map((c) => c.sfondo)).size).toBe(12);
    expect(coloreFase("da-chiamare-prima-volta").pieno).toBe("#EC5E2D");
    expect(coloreFase("chiuso").pieno).toBe("#16A34A");
    for (const c of colori) expect(contrasto(c.testo, c.sfondo)).toBeGreaterThanOrEqual(4.5);
    expect(coloreFase("boh")).toEqual(coloreFase("non-chiuso"));
  });

  it("etichetta: sfondo, bordo pieno da 1 px e testo dal colore della fase, alta 24 px, niente pallino", () => {
    const c = coloreFase("presentazione-confermata");
    const html = render(<EtichettaFase id="presentazione-confermata" label="Offerta fissata" freccia />);
    expect(html).toContain("h-6");
    expect(html).toContain(`background-color:${c.sfondo}`);
    expect(html).toContain(`border-color:${c.pieno}`);
    expect(html).toContain(`color:${c.testo}`);
    expect(html).toContain("Offerta fissata");
    expect(html).toContain("<svg"); // la freccia per cambiare fase
    expect(html).not.toContain("rounded-full");
  });

  it("nome dall'elenco delle fasi; fase sconosciuta in grigio con l'id", () => {
    expect(faseDi(FASI, "da-richiamare")).toMatchObject({ id: "da-richiamare", label: "Da richiamare" });
    expect(faseDi(FASI, "boh")).toEqual({ id: "boh", label: "boh" });
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
