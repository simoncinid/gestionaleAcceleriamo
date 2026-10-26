import { describe, expect, it } from "vitest";
import { Call } from "../src/pagine/commerciale/Call";
import { FoglioCall } from "../src/pagine/commerciale/FoglioCall";
import { FoglioFissaCall } from "../src/pagine/commerciale/FoglioFissaCall";
import { leggiNote, noteVuote } from "../src/pagine/commerciale/note-call";
import { daRoma } from "../worker/lib/roma";
import type { CallAgenda } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = daRoma(2026, 10, 13, 10, 0); // martedì
const k = (id: string, scheduledAt: number, extra: Partial<CallAgenda> = {}): CallAgenda => ({
  id, leadId: id, company: `Officina ${id}`, contactName: "Luca Prova", phone: null, email: null, kind: "conoscenza", scheduledAt,
  meetLink: "https://meet.google.com/abc", notes: null, outcome: null, inviteSentAt: null, durationMin: null, ...extra,
});
const lunedi = daRoma(2026, 10, 12);
const chiave = ["calls", lunedi];

describe("schermata Call", () => {
  it("Apri Meet pieno solo sulla prossima call di oggi; passate senza note in Da completare", () => {
    const html = render(<Call ora={ORA} />, { dati: [[chiave, [k("ieri", daRoma(2026, 10, 12, 15)), k("oggi", daRoma(2026, 10, 13, 11)), k("giovedi", daRoma(2026, 10, 15, 9))]]] });
    expect(html).toMatch(/Call[^<]*<strong[^>]*>3<\/strong> questa settimana/);
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Da completare");
    expect(html).toContain("Officina ieri");
    expect(html).toContain("giovedì");
    expect(html).toContain("Manca l&#x27;esito");
  });
  it("nessuna call oggi: nessun pulsante pieno", () => {
    const html = render(<Call ora={ORA} />, { dati: [[chiave, [k("giovedi", daRoma(2026, 10, 15, 9))]]] });
    expect(contaPrimari(html)).toBe(0);
  });
  it("call fatta con le note non resta da completare", () => {
    const html = render(<Call ora={ORA} />, { dati: [[chiave, [k("ieri", daRoma(2026, 10, 12, 15), { outcome: "fatta", notes: JSON.stringify({ problema: "Fogli Excel" }) })]]] });
    expect(html).not.toContain("Da completare");
  });
  it("niente in settimana: stato vuoto", () => {
    const html = render(<Call ora={ORA} />, { dati: [[chiave, []]] });
    expect(html).toContain("Nessuna call questa settimana");
    expect(contaPrimari(html)).toBe(0);
  });
});

describe("fogli della call", () => {
  it("Fissa call: un solo primario, invito acceso di default, tipo e giorno con i selettori", () => {
    // Il pulsante promette l'invito solo con Resend collegato (Q5).
    const html = render(<FoglioFissaCall leadId="l1" haEmail onChiudi={() => {}} />, { dati: [[["integrazioni"], { segreti: { resend: true } }]] });
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Fissa call e manda l&#x27;invito");
    expect(html).toContain('data-selettore="Tipo"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="date"');
  });
  it("Fissa call senza email: invito spento e detto", () => {
    const html = render(<FoglioFissaCall leadId="l1" haEmail={false} onChiudi={() => {}} />);
    expect(html).toContain("Manca l&#x27;email del referente");
    expect(html).not.toContain("Fissa call e manda");
  });
  it("Foglio della call: un solo primario e le note dello schema per tipo", () => {
    const html = render(<FoglioCall k={k("x", ORA, { kind: "presentazione" })} onChiudi={() => {}} />);
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Reazione alla proposta");
    expect(html).not.toContain("Cosa fa durante il giorno");
  });
  it("note: JSON, testo semplice e vuote", () => {
    expect(leggiNote('{"problema":"Excel"}')).toEqual({ problema: "Excel" });
    expect(leggiNote("appunti a mano")).toEqual({ libero: "appunti a mano" });
    expect(noteVuote('{"problema":"  "}')).toBe(true);
    expect(noteVuote(null)).toBe(true);
  });
});
