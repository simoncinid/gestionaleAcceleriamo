// tests/avvisi-pagina.test.tsx
import { describe, expect, it } from "vitest";
import { BarraLaterale } from "../src/guscio/BarraLaterale";
import { Testata } from "../src/guscio/Testata";
import { Avvisi } from "../src/pagine/avvisi/Avvisi";
import { Stato } from "../src/pagine/impostazioni/Stato";
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

describe("letti e non letti", () => {
  it("il non letto ha titolo in peso medio e pallino, il letto peso normale", async () => {
    const base = { evento: "sla_scaduto", testo: null, href: null, createdAt: 0 };
    const html = await render(<Avvisi />, { percorso: "/impostazioni/avvisi", dati: [[["notifications"], { nonLetti: 1, avvisi: [{ ...base, id: "1", titolo: "Nuovo", letto: false }, { ...base, id: "2", titolo: "Vecchio", letto: true }] }]] });
    expect(html).toMatch(/font-medium">Nuovo</);
    expect(html).toMatch(/font-normal">Vecchio</);
    expect(html.match(/Da leggere/g)).toHaveLength(1);
  });
});

describe("Avvisi in Stato", () => {
  it("in testa, fuori da Configurazione, con il numero degli aperti", async () => {
    const stato = { integrazioni: [], settimana: { meta: 0, foglio: 0, aggancio: 0 }, errori: [] };
    const avvisi = { nonLetti: 0, avvisi: [{ id: "1" }, { id: "2" }, { id: "3" }] };
    const html = await render(<Stato ora={0} onEsci={() => {}} />, { dati: [[["integrazioni"], stato], [["notifications"], avvisi]] });
    expect(html).toContain("Avvisi (3)");
    expect(html.indexOf("Avvisi (3)")).toBeLessThan(html.indexOf("Collegamenti"));
  });
});
