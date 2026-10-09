import { describe, expect, it } from "vitest";
import { Numeri } from "../src/pagine/commerciale/Numeri";
import { contaPrimari, render } from "./render";

describe("Numeri della 1A nel nuovo stile", () => {
  it("fonti con la percentuale, Foglio Andrea con il suo nome, nessun primario", () => {
    const stats = {
      bySource: [{ source: "foglio_andrea", total: 10, won: 2, lost: 3 }],
      byCampaign: [], byStage: [{ stageId: "da-richiamare", label: "Da richiamare", count: 4 }],
      firstResponse: { avgMs: 42 * 60_000, count: 9 },
    };
    const html = render(<Numeri />, { dati: [[["stats", "30"], stats]] });
    expect(html).toContain("Foglio Andrea");
    expect(html).toContain("20%");
    expect(html).toContain("Da richiamare");
    expect(contaPrimari(html)).toBe(0);
    expect(html).not.toContain("<table");
  });
});
