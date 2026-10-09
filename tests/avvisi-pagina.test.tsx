// tests/avvisi-pagina.test.tsx
import { describe, expect, it } from "vitest";
import { BarraLaterale } from "../src/guscio/BarraLaterale";
import { Testata } from "../src/guscio/Testata";
import { Avvisi } from "../src/pagine/avvisi/Avvisi";
import { contaPrimari, render } from "./render";

describe("pagina Avvisi", () => {
  it("una riga per avviso, nessun pulsante pieno", async () => {
    const html = await render(<Avvisi />, { percorso: "/impostazioni/avvisi", dati: [[["notifications"], { nonLetti: 0, avvisi: [{ id: "1", evento: "sla_scaduto", titolo: "Prima chiamata scaduta: Officina Prova", testo: null, href: "/commerciale/lead/L1", createdAt: 0, letto: true }] }]] });
    expect(html).toContain("Prima chiamata scaduta: Officina Prova");
    expect(contaPrimari(html)).toBe(0);
  });
  it("stato vuoto", async () => {
    const html = await render(<Avvisi />, { percorso: "/impostazioni/avvisi", dati: [[["notifications"], { nonLetti: 0, avvisi: [] }]] });
    expect(html).toContain("Nessun avviso aperto");
  });
});

describe("avatar e avvisi", () => {
  const badge = (avvisi: number) => ({ commerciale: 0, economia: 0, avvisi, avatar: avvisi > 0 });
  it("barra laterale: con avvisi non letti punto accento e link agli Avvisi", async () => {
    const html = await render(<BarraLaterale nome="Tommaso" badge={badge(2)} onCrea={() => {}} onEsci={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).toContain('href="/impostazioni/avvisi"');
    expect(html).toContain("Avvisi da leggere");
  });
  it("barra laterale: senza avvisi niente punto e l'avatar porta alle Impostazioni", async () => {
    const html = await render(<BarraLaterale nome="Tommaso" badge={badge(0)} onCrea={() => {}} onEsci={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).not.toContain('href="/impostazioni/avvisi"');
    expect(html).not.toContain("Avvisi da leggere");
  });
  it("testata: con avvisi l'avatar porta agli Avvisi", async () => {
    const html = await render(<Testata nome="Tommaso" puntoAvatar avvisi={1} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).toContain('href="/impostazioni/avvisi"');
  });
});
