// Difetti visivi trovati dalla QA del Task 15 (Playwright a 390 px): una prova per difetto.
import { describe, expect, it } from "vitest";
import { Chip, Contatto } from "../src/ds";
import { Testata } from "../src/guscio/Testata";
import { Avvisi } from "../src/pagine/avvisi/Avvisi";
import { Diario } from "../src/pagine/commerciale/Diario";
import { Lunedi } from "../src/pagine/commerciale/Lunedi";
import { render } from "./render";

describe("QA Piano B", () => {
  it("Avvisi: la lista non allarga la pagina e dice da quanto è nato l'avviso", () => {
    const avvisi = [{ id: "1", evento: "sla_scaduto", titolo: "Prima chiamata scaduta: Carpenteria Metallica Fratelli Bertolucci", testo: null, href: "/commerciale/lead/L1", createdAt: Date.now() - 23 * 60_000, letto: true }];
    const html = render(<Avvisi />, { percorso: "/impostazioni/avvisi", dati: [[["notifications"], { nonLetti: 0, avvisi }]] });
    expect(html).toMatch(/<ul class="grid grid-cols-1 gap-2">/);
    expect(html).toContain("23 min fa");
    expect(html).not.toContain("scaduta da");
  });

  it("Contatto a icona: sul telefono solo l'icona da 44 px, il nome resta per lo screen reader", () => {
    const html = render(<Contatto tipo="chiama" lead={{ phone: "+39 000 1234567" }} variante="icona" senzaNome />);
    expect(html).toContain('<span class="sr-only md:not-sr-only">Chiama</span>');
    expect(html).toMatch(/class="[^"]*\bw-11\b[^"]*\bshrink-0\b/);
    expect(html).not.toMatch(/\btruncate\b/);
  });

  it("Lunedì: la fonte a mano si legge 'Di cui a mano'", () => {
    const numeri = { da: 0, a: 1, arrivati: 2, perFonte: [{ source: "manuale", n: 1 }, { source: "meta", n: 1 }], costoPerLeadCents: null, conoscenza: 0, presentazione: 0, proposte: 0, vinti: 0, fermi: [], proposteFerme: [], ricorrenteCents: 0, obiettivoCents: 0, spesaAdsMeseCents: 0 };
    const html = render(<Lunedi />, { percorso: "/commerciale/oggi/lunedi", dati: [[["lunedi", "corrente"], { id: "R1", settimana: "2026-10-05", numeri, decisioni: ["", "", ""], commento: null, commentoStato: "nessuno", chiusaDa: null, chiusaAt: null }]] });
    expect(html).toContain("Di cui a mano");
    expect(html).toContain("Di cui da Meta");
    expect(html).not.toContain("da A mano");
  });

  it("Diario: tutta la riga è il link, non solo il testo", () => {
    const voci = [{ id: "A1", at: Date.UTC(2026, 9, 10, 7, 12), chi: "Diego", testo: "Esito: Officina Bertini", dettaglio: "richiamare", area: "commerciale", href: "/commerciale/lead/L1" }];
    const html = render(<Diario />, { percorso: "/commerciale/oggi/diario", dati: [[["diario", "tutti", "tutte"], { pages: [{ voci, prossimo: null }], pageParams: [null] }], [["users"], []]] });
    expect(html).toMatch(/<li><a [^>]*class="[^"]*\bmin-h-11\b[^"]*"[^>]*href="\/commerciale\/lead\/L1"|<li><a [^>]*href="\/commerciale\/lead\/L1"[^>]*class="[^"]*\bmin-h-11\b/);
    expect(html).toMatch(/<a [^>]*>.*Esito: Officina Bertini.*richiamare.*Diego.*<\/a><\/li>/);
  });

  it("Chip e voci del sottomenu: bersagli da almeno 44 px", () => {
    expect(render(<Chip>Oggi</Chip>)).toContain("h-11");
    const html = render(<Testata nome="Tommaso" puntoAvatar={false} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/commerciale/oggi" });
    const voci = html.match(/<a [^>]*aria-current[^>]*>|<a href="\/commerciale\/[a-z]+" class="[^"]*"/g) ?? [];
    expect(voci.length).toBeGreaterThan(0);
    for (const v of voci) expect(v).toContain("min-w-11");
  });
});
