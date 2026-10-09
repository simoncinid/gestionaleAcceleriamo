import { describe, expect, it } from "vitest";
import { FoglioFissaCall } from "../src/pagine/commerciale/FoglioFissaCall";
import { contaPrimari, render } from "./render";

describe("Q14: foglio della call aperto dal cambio di fase", () => {
  it("titolo con la fase, niente scelta del tipo, un solo primario", () => {
    const html = render(<FoglioFissaCall leadId="abc" haEmail={false} fase={{ label: "Appuntamento confermato", kind: "conoscenza" }} onChiudi={() => {}} />);
    expect(html).toContain("Appuntamento confermato: quando è la call");
    expect(html).not.toContain('data-selettore="Tipo"');
    expect(html).toContain("Giorno e ora");
    expect(contaPrimari(html)).toBe(1);
  });
  it("aperto da Fissa call resta con la scelta del tipo", () => {
    const html = render(<FoglioFissaCall leadId="abc" haEmail={false} onChiudi={() => {}} />);
    expect(html).toContain('data-selettore="Tipo"');
  });
});
