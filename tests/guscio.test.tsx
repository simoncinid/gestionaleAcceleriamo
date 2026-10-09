import { describe, expect, it } from "vitest";
import { AREE, REDIRECT_1A, SOTTOMENU, TUTTE_LE_CREAZIONI, areaDi, creazioneDelPiu, creazioniDelPercorso } from "../src/guscio/aree";
import { BarraBasso } from "../src/guscio/BarraBasso";
import { BarraLaterale } from "../src/guscio/BarraLaterale";
import { Testata } from "../src/guscio/Testata";
import { leggiScorciatoia } from "../src/guscio/scorciatoie";
import { contaPrimari, render } from "./render";

describe("aree e sottomenu", () => {
  it("tre aree nell'ordine deciso da Tommaso: Commerciale, Automazioni al centro, Economia", () => {
    expect(AREE.map((a) => a.etichetta)).toEqual(["Commerciale", "Automazioni", "Economia"]);
    expect(SOTTOMENU.commerciale.map((s) => s.etichetta)).toEqual(["Oggi", "Scaletta", "Call", "Proposte", "Clienti", "Numeri"]);
    expect(SOTTOMENU.economia.map((s) => s.etichetta)).toEqual(["Cruscotto", "Canoni", "Fatture", "Costi"]);
    expect(SOTTOMENU.automazioni.map((s) => s.etichetta)).toEqual(["Pannello", "In costruzione"]);
  });
  it("riconosce l'area dal percorso", () => {
    expect(areaDi("/commerciale/lead/abc")).toBe("commerciale");
    expect(areaDi("/economia/costi")).toBe("economia");
    expect(areaDi("/impostazioni/fasi")).toBeNull();
  });
});

describe("il + nella testata", () => {
  it("in Commerciale: Nuovo lead per primo, poi esito, nota, cliente, proposta", () => {
    for (const p of ["/commerciale/oggi", "/commerciale/proposte", "/commerciale/lead/x", "/impostazioni"]) {
      expect(creazioniDelPercorso(p).map((c) => c.etichetta)).toEqual(["Nuovo lead", "Esito di una chiamata", "Nota su un lead", "Nuovo cliente", "Proposta a mano"]);
    }
  });
  it("in Economia le tre creazioni dell'area, in Automazioni una sola", () => {
    expect(creazioniDelPercorso("/economia/canoni").map((c) => c.id)).toEqual(["fattura", "canone", "costo"]);
    expect(creazioniDelPercorso("/automazioni").map((c) => c.id)).toEqual(["automazione"]);
  });
  it.each([
    ["/commerciale/oggi", "lead"], ["/commerciale/scaletta", "lead"], ["/commerciale/call", "lead"], ["/commerciale/lead/x", "lead"],
    ["/commerciale/proposte", "proposta"], ["/commerciale/clienti", "cliente"], ["/commerciale/clienti/x", "cliente"],
    ["/economia", "fattura"], ["/economia/fatture", "fattura"], ["/economia/canoni", "canone"], ["/economia/costi", "costo"],
    ["/automazioni", "automazione"], ["/automazioni/in-costruzione", "automazione"], ["/impostazioni", "lead"],
  ])("%s crea %s", (percorso, attesa) => {
    expect(creazioneDelPiu(percorso)).toBe(attesa);
  });
  it("nove creazioni in tutto, ognuna in una sola area", () => {
    expect(TUTTE_LE_CREAZIONI.map((c) => c.id)).toEqual(["lead", "esito", "nota", "cliente", "proposta", "canone", "fattura", "costo", "automazione"]);
  });
});

describe("redirect della 1A", () => {
  it("sei indirizzi vecchi", () => {
    expect(REDIRECT_1A).toEqual([
      { da: "/oggi", a: "/commerciale/oggi" },
      { da: "/scaletta", a: "/commerciale/scaletta" },
      { da: "/lead/:id", a: "/commerciale/lead/:id" },
      { da: "/numeri", a: "/commerciale/numeri" },
      { da: "/cestino", a: "/impostazioni/dati/cestino" },
      { da: "/fasi", a: "/impostazioni/fasi" },
    ]);
  });
});

describe("BarraBasso", () => {
  it("solo tre aree, nessun +, voce attiva marcata", () => {
    const html = render(<BarraBasso badge={{ commerciale: 3, economia: 0, avatar: false }} />, { percorso: "/economia/canoni" });
    const etichette = [...html.matchAll(/data-voce="([^"]+)"/g)].map((m) => m[1]);
    expect(etichette).toEqual(["commerciale", "automazioni", "economia"]);
    expect(html).toMatch(/data-voce="economia"[^>]*aria-current="page"/);
    expect(html).not.toContain("Crea");
    expect(html).toContain(">3<");
    // Icone 3D in PNG (decisione del controller: file copiati dai mockup come <area>.png).
    expect(html).toContain('src="/icone/commerciale.png"');
  });
  it("senza badge (la rotta /api/badge non c'è ancora) nessun numero", () => {
    const html = render(<BarraBasso badge={undefined} />, { percorso: "/commerciale/oggi" });
    expect(html).not.toMatch(/>\d+</);
  });
});

describe("Testata", () => {
  it("il + sta in alto a destra, dopo la lente e prima dell'avatar", () => {
    const html = render(<Testata nome="Tommaso" puntoAvatar={false} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/economia/canoni" });
    expect(html).toContain('aria-label="Crea in Economia"');
    const ordine = [...html.matchAll(/aria-label="(Cerca|Crea in Economia|Profilo e impostazioni)"/g)].map((m) => m[1]);
    expect(ordine).toEqual(["Cerca", "Crea in Economia", "Profilo e impostazioni"]);
  });
  it("l'avatar porta alle Impostazioni e il chrome non aggiunge primari alla pagina", () => {
    const html = render(<Testata nome="Tommaso" puntoAvatar onCerca={() => {}} onPiu={() => {}} />, { percorso: "/commerciale/oggi" });
    const avatar = html.match(/<a [^>]*aria-label="Profilo e impostazioni"[^>]*>/)![0];
    expect(avatar).toContain('href="/impostazioni"');
    expect(html).toContain("Un&#x27;integrazione chiede attenzione");
    expect(contaPrimari(html)).toBe(0);
  });
  it("fuori dalle aree il titolo è Impostazioni e il + crea nel Commerciale", () => {
    const html = render(<Testata nome="Tommaso" puntoAvatar={false} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/impostazioni/fasi" });
    expect(html).toContain(">Impostazioni<");
    expect(html).toContain('aria-label="Crea in Commerciale"');
    expect(html).not.toContain('aria-label="Sottomenu"');
  });
});

describe("il + della testata e il sottomenu", () => {
  it("il + è un quadrato con il bordo, senza fondo arancione", () => {
    const html = render(<Testata nome="Tommaso" puntoAvatar={false} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/commerciale/oggi" });
    const piu = html.match(/<button [^>]*aria-label="Crea in Commerciale"[^>]*>.*?<\/button>/)![0];
    expect(piu).not.toContain("bg-accento");
    expect(piu).toContain("border-chrome-testo/60");
  });
  it("la scheda attiva del sottomenu è sottolineata in arancione", () => {
    const html = render(<Testata nome="Tommaso" puntoAvatar={false} onCerca={() => {}} onPiu={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*border-accento[^>]*>Oggi<|<a [^>]*border-accento[^>]*aria-current="page"[^>]*>Oggi</);
  });
});

describe("BarraLaterale", () => {
  it.each([
    ["/commerciale/oggi", "Nuovo lead"], ["/automazioni", "Nuova automazione"], ["/economia/canoni", "Nuova fattura"], ["/impostazioni", "Nuovo lead"],
  ])("in %s il pulsante dice %s", (percorso, etichetta) => {
    const html = render(<BarraLaterale nome="Tommaso" badge={undefined} onPiu={() => {}} onEsci={() => {}} />, { percorso });
    expect(html).toContain(`</svg>${etichetta}</button>`);
    expect(html).not.toContain("</svg>Crea</button>");
  });
  it("stesso ordine delle aree, area corrente aperta con il suo sottomenu", () => {
    const html = render(<BarraLaterale nome="Tommaso" badge={undefined} onPiu={() => {}} onEsci={() => {}} />, { percorso: "/commerciale/oggi" });
    const aree = [...html.matchAll(/data-area="([^"]+)"/g)].map((m) => m[1]);
    expect(aree).toEqual(["commerciale", "automazioni", "economia"]);
    expect(html).toContain('href="/commerciale/scaletta"');
    expect(html).not.toContain('href="/economia/canoni"');
    expect(contaPrimari(html)).toBe(0);
  });
});

describe("scorciatoie", () => {
  it("g poi o porta a Oggi, una lettera sola non fa niente", () => {
    expect(leggiScorciatoia(null, "g")).toEqual({ attesa: "g" });
    expect(leggiScorciatoia("g", "o")).toEqual({ percorso: "/commerciale/oggi", attesa: null });
    expect(leggiScorciatoia(null, "o")).toEqual({ attesa: null });
  });
});
