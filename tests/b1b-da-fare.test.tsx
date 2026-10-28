import { describe, expect, it } from "vitest";
import { NextActionCard, type InLinea } from "../src/pagine/commerciale/lead/NextActionCard";
import { distanza } from "../src/pagine/commerciale/lead/daFare";
import { prossimaAzione } from "../worker/processo/processo";
import type { Lead, Stage } from "../src/types";
import { contaPrimari, render } from "./render";

// Blocco 1, modifica 11: la sezione Da fare per fase (contratto, sezione 3).
const ORA = Date.UTC(2026, 9, 28, 9, 0); // mercoledì 28 ottobre, 10:00 a Roma
const ORA_MS = 3_600_000;

const base = {
  id: "l1", company: "Officina Prova", contactName: "Luca Prova", email: "luca@esempio.it", phone: "+393330000001", source: "manuale",
  stageId: "da-chiamare-prima-volta", stageChangedAt: ORA - 86_400_000, nextAction: null, nextActionAt: null, appointmentAt: null,
  attemptCount: 0, meetLink: null, lostReason: null, createdAt: ORA - 86_400_000, updatedAt: ORA, ownerId: null, noShow: 0, pausedUntil: null,
};
const lead = (x: Record<string, unknown>) => {
  const l = { ...base, ...x };
  return { ...l, prossima: prossimaAzione(l as unknown as Parameters<typeof prossimaAzione>[0], ORA) } as unknown as Lead;
};
const kindDi = (stageId: string): Stage["kind"] => (stageId === "chiuso" ? "won" : stageId === "non-chiuso" || stageId === "fake" ? "lost" : "open");
const scheda = (l: Lead, inLinea: InLinea = {}) => render(<NextActionCard lead={l} kind={kindDi(l.stageId)} ora={ORA} inLinea={inLinea} onComando={() => undefined} />);

describe("Da fare, fasi 10 e 20", () => {
  it("10: un solo primario Chiama col nome, tentativo, niente 'Se non risponde'", () => {
    const html = scheda(lead({ nextActionAt: ORA - 2 * ORA_MS }));
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain(">Chiama Luca<");
    expect(html).toMatch(/[Tt]entativo 1 di 5/);
    expect(html).not.toContain("Se non risponde");
  });
  it("20: tentativo mostrato, scadenza di ieri in rosso", () => {
    const html = scheda(lead({ stageId: "da-richiamare", attemptCount: 2, nextActionAt: ORA - 2 * 86_400_000 }));
    expect(html).toMatch(/[Tt]entativo 3 di 5/);
    expect(html).toContain("#B42318");
  });
  it("senza telefono: Chiama resta ma spento", () => {
    const html = scheda(lead({ phone: null, nextActionAt: ORA + ORA_MS }));
    expect(html).not.toContain('href="tel:');
    expect(html).toContain("Chiama Luca");
  });
});

describe("Da fare, fasi con la call (30 e 50)", () => {
  const call = { id: "c1", scheduledAt: ORA + 2 * 86_400_000 + 5 * ORA_MS };
  it("30: data, canale, link in linea alla call; senza link 'Aggiungi il link della call'", () => {
    const html = scheda(lead({ stageId: "appuntamento-confermato", appointmentAt: call.scheduledAt, nextActionAt: call.scheduledAt }), { call });
    expect(html).toContain("al telefono");
    expect(html).toContain('href="/commerciale/call/c1"');
    expect(html).toContain("Call: Venerdì 30 ottobre, 15:00");
    expect(html).toContain("Aggiungi il link della call");
    expect(html).not.toMatch(/[Tt]entativo/);
  });
  it("50 con link: Google Meet, niente invito ad aggiungerlo", () => {
    const html = scheda(lead({ stageId: "presentazione-confermata", appointmentAt: call.scheduledAt, nextActionAt: call.scheduledAt, meetLink: "https://meet.google.com/abc" }), { call });
    expect(html).toContain("su Google Meet");
    expect(html).not.toContain("Aggiungi il link della call");
    expect(contaPrimari(html)).toBeLessThanOrEqual(1);
  });
});

describe("Da fare, fase 40", () => {
  it("senza proposta: 'Nessuna proposta collegata: Crea la proposta'", () => {
    const html = scheda(lead({ stageId: "in-attesa-preventivo", nextActionAt: ORA + 86_400_000 }));
    expect(html).toContain("Nessuna proposta collegata:");
    expect(html).toContain("Crea la proposta");
  });
  it("con proposta: link in linea col numero", () => {
    const html = scheda(lead({ stageId: "in-attesa-preventivo", nextActionAt: ORA + 86_400_000 }), { proposta: { id: "p1", number: "DEMO-2026-032" } });
    expect(html).toContain("Proposta DEMO-2026-032");
    expect(html).toContain('href="/commerciale/proposte/p1"');
    expect(html).not.toContain("Nessuna proposta collegata");
  });
});

describe("Da fare, lead chiusi", () => {
  it("70: chiuso come cliente, Apri il cliente e link al cliente", () => {
    const html = scheda(lead({ stageId: "chiuso" }), { cliente: { id: "k1", name: "Officina Prova" } });
    expect(html).toContain("Chiuso come cliente il");
    expect(html).toContain(">Apri il cliente<");
    expect(html).toContain("Cliente: Officina Prova");
    expect(contaPrimari(html)).toBe(1);
  });
  it("80: chiuso col motivo, Riapri secondario, nessun primario", () => {
    const html = scheda(lead({ stageId: "non-chiuso", lostReason: "prezzo" }));
    expect(html).toMatch(/Chiuso il [^<]+: /);
    expect(html).toContain("Riapri");
    expect(contaPrimari(html)).toBe(0);
  });
});

describe("distanza nel tempo", () => {
  it("oggi, domani, fra N giorni, scaduta", () => {
    expect(distanza(ORA + ORA_MS, "oggi", ORA)).toBe("oggi alle 11:00");
    expect(distanza(ORA + 86_400_000, "futuro", ORA)).toBe("domani alle 10:00");
    expect(distanza(ORA + 3 * 86_400_000, "futuro", ORA)).toBe("fra 3 giorni");
    expect(distanza(ORA - 2 * 86_400_000, "scaduto", ORA)).toBe("scaduta da 2 giorni");
  });
});
