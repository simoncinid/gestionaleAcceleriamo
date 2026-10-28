import { afterEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router";
import { BarraLaterale } from "../src/guscio/BarraLaterale";
import { Guscio } from "../src/guscio/Guscio";
import { CHIAVE_BARRA, etichettaScorciatoia, leggiBarra, leggiRidotta, salvaBarra, scorciatoiaBarra, testoRidotta } from "../src/guscio/barraRidotta";
import { contaPrimari, render } from "./render";

// Blocco 1 bis: barra laterale richiudibile (aperta 256 px, ridotta 64 px di sole icone).
class Memoria {
  dati = new Map<string, string>();
  getItem(k: string) { return this.dati.get(k) ?? null; }
  setItem(k: string, v: string) { this.dati.set(k, String(v)); }
  removeItem(k: string) { this.dati.delete(k); }
}
const originale = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const conMemoria = () => { const m = new Memoria(); Object.defineProperty(globalThis, "localStorage", { value: m, configurable: true }); return m; };
afterEach(() => { if (originale) Object.defineProperty(globalThis, "localStorage", originale); else delete (globalThis as { localStorage?: unknown }).localStorage; });

const tasto = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
const barra = (percorso: string, ridotta: boolean, badge?: { commerciale: number; economia: number; avvisi: number; avatar: boolean }) =>
  render(<BarraLaterale nome="Tommaso" badge={badge as never} onCrea={() => {}} onEsci={() => {}} onCerca={() => {}} ridotta={ridotta} onRiduci={() => {}} />, { percorso });

describe("stato della barra nel browser", () => {
  it("default aperta: niente valore, valore sconosciuto o rotto", () => {
    expect(leggiRidotta(null)).toBe(false);
    expect(leggiRidotta("0")).toBe(false);
    expect(leggiRidotta("true")).toBe(false);
    expect(leggiRidotta("1")).toBe(true);
    expect(testoRidotta(true)).toBe("1");
    expect(testoRidotta(false)).toBe("0");
  });
  it("scrive e rilegge dalla stessa chiave del computer", () => {
    const m = conMemoria();
    expect(leggiBarra()).toBe(false);
    salvaBarra(true);
    expect(m.getItem(CHIAVE_BARRA)).toBe("1");
    expect(leggiBarra()).toBe(true);
    salvaBarra(false);
    expect(m.getItem(CHIAVE_BARRA)).toBe("0");
    expect(leggiBarra()).toBe(false);
  });
  it("senza localStorage o con localStorage che lancia resta aperta e non si rompe", () => {
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloccato"); }, configurable: true });
    expect(leggiBarra()).toBe(false);
    expect(() => salvaBarra(true)).not.toThrow();
  });
  it("il guscio legge lo stato al primo disegno: ridotta salvata, barra già stretta", () => {
    conMemoria().setItem(CHIAVE_BARRA, "1");
    const html = render(<Routes><Route element={<Guscio nome="Tommaso" onEsci={() => {}} fogli={() => null} />}><Route path="/commerciale/lead" element={<p>Lead</p>} /></Route></Routes>, { percorso: "/commerciale/lead" });
    expect(html).toMatch(/<aside id="barra-laterale" data-ridotta="true"[^>]*w-16/);
    expect(html).toContain('aria-label="Apri la barra laterale"');
  });
});

describe("scorciatoia Cmd B / Ctrl B", () => {
  it("Cmd B e Ctrl B sì, maiuscola compresa", () => {
    expect(scorciatoiaBarra(tasto("b", { metaKey: true }))).toBe(true);
    expect(scorciatoiaBarra(tasto("b", { ctrlKey: true }))).toBe(true);
    expect(scorciatoiaBarra(tasto("B", { metaKey: true }))).toBe(true);
  });
  it("b da sola, Cmd Maiusc B, Cmd Alt B e Cmd K no", () => {
    expect(scorciatoiaBarra(tasto("b"))).toBe(false);
    expect(scorciatoiaBarra(tasto("b", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(scorciatoiaBarra(tasto("b", { metaKey: true, altKey: true }))).toBe(false);
    expect(scorciatoiaBarra(tasto("k", { metaKey: true }))).toBe(false);
  });
  it("nel suggerimento: ⌘B sul Mac, Ctrl+B su Windows", () => {
    expect(etichettaScorciatoia("MacIntel")).toBe("⌘B");
    expect(etichettaScorciatoia("Win32")).toBe("Ctrl+B");
    expect(etichettaScorciatoia("Linux x86_64")).toBe("Ctrl+B");
  });
});

describe("barra aperta", () => {
  it("pulsante « nella riga del logo, con etichetta e stato", () => {
    const html = barra("/commerciale/lead", false);
    expect(html).toMatch(/<aside id="barra-laterale"[^>]*w-64/);
    expect(html).toMatch(/<button type="button" aria-label="Chiudi la barra laterale" aria-expanded="true" aria-controls="barra-laterale"/);
    expect(html.indexOf("logo-negativo.svg")).toBeLessThan(html.indexOf("Chiudi la barra laterale"));
    expect(html.indexOf("Chiudi la barra laterale")).toBeLessThan(html.indexOf("Nuovo lead"));
    expect(html.match(/barra laterale"/g)).toHaveLength(1);
  });
  it("aree e sottovoci come prima", () => {
    const html = barra("/commerciale/lead", false);
    expect([...html.matchAll(/data-area="([^"]+)"/g)].map((m) => m[1])).toEqual(["commerciale", "automazioni", "economia"]);
    expect(html).toContain('href="/commerciale/numeri"');
    expect(contaPrimari(html)).toBe(0);
  });
  it("hidden md:flex: sul telefono la barra non c'è, e con lei il pulsante", () => {
    expect(barra("/commerciale/lead", false)).toMatch(/<aside[^>]*class="[^"]*\bhidden\b[^"]*md:flex/);
    expect(barra("/commerciale/lead", true)).toMatch(/<aside[^>]*class="[^"]*\bhidden\b[^"]*md:flex/);
  });
});

describe("barra ridotta", () => {
  it("colonna da 64 px: segno del logo, » sotto, +, lente, tre aree, avatar, ingranaggio, esci", () => {
    const html = barra("/commerciale/lead", true);
    expect(html).toMatch(/<aside[^>]*w-16/);
    expect(html).toContain("nodo-arancione.svg");
    expect(html).not.toContain("logo-negativo.svg");
    const ordine = ["nodo-arancione.svg", 'aria-label="Apri la barra laterale"', 'aria-label="Nuovo lead"', 'aria-label="Cerca"', 'data-area="commerciale"', 'data-area="automazioni"', 'data-area="economia"', 'aria-label="Profilo e impostazioni"', 'aria-label="Impostazioni"', 'aria-label="Esci"'];
    const posizioni = ordine.map((s) => html.indexOf(s));
    expect(posizioni.every((p) => p >= 0)).toBe(true);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
    expect(html).toMatch(/aria-label="Apri la barra laterale" aria-expanded="false"/);
  });
  it("niente testi lunghi né sottovoci in colonna: le voci stanno nel menu a comparsa", () => {
    const html = barra("/commerciale/lead", true);
    expect(html).not.toContain('href="/commerciale/numeri"');
    expect(html).not.toContain(">Commerciale<");
    expect(html).toMatch(/data-area="commerciale" aria-label="Commerciale" aria-haspopup="menu" aria-expanded="false"/);
  });
  it("icone raggiungibili da tastiera: pulsanti e link veri, nessun tabindex negativo", () => {
    const html = barra("/commerciale/lead", true);
    expect(html).not.toContain('tabindex="-1"');
    expect((html.match(/<button /g) ?? []).length).toBe(7); // », +, lente, tre aree, esci
  });
  it("area corrente accesa, le altre spente; il + resta secondario", () => {
    const html = barra("/economia/canoni", true);
    expect(html).toMatch(/data-area="economia"[^>]*class="[^"]*\sbg-chrome-2"/);
    expect(html).not.toMatch(/data-area="commerciale"[^>]*class="[^"]*\sbg-chrome-2"/);
    expect(html).toMatch(/aria-label="Nuova fattura"/);
    expect(contaPrimari(html)).toBe(0);
  });
  it("conteggi sulle icone e nel nome letto dallo screen reader", () => {
    const html = barra("/commerciale/lead", true, { commerciale: 4, economia: 2, avvisi: 0, avatar: false });
    expect(html).toContain('aria-label="Commerciale, 4 da fare oggi"');
    expect(html).toContain('aria-label="Economia, 2 da vedere"');
  });
});
