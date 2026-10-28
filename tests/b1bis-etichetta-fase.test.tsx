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
