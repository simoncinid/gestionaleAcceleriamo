import { describe, expect, it } from "vitest";
import { descrizioneAnonima, prossimoStatoCanone, statoCliente, statoFattura } from "../worker/economia/calcoli";

const NOW = Date.UTC(2026, 10, 20, 9, 0);
const G = 86_400_000;

describe("stato della fattura", () => {
  it("in ritardo si calcola: emessa, scaduta, non incassata", () => {
    expect(statoFattura({ issuedAt: NOW - 20 * G, dueAt: NOW - G, paidAt: null }, NOW)).toBe("in_ritardo");
    expect(statoFattura({ issuedAt: NOW - 5 * G, dueAt: NOW + 10 * G, paidAt: null }, NOW)).toBe("emessa");
    expect(statoFattura({ issuedAt: null, dueAt: null, paidAt: null }, NOW)).toBe("da_emettere");
    expect(statoFattura({ issuedAt: NOW - 20 * G, dueAt: NOW - G, paidAt: NOW - 2 * G }, NOW)).toBe("incassata");
  });
});

describe("stato del cliente", () => {
  it("attivo con un canone attivo o un'automazione attiva", () => {
    expect(statoCliente([{ status: "attivo" }], [])).toBe("attivo");
    expect(statoCliente([{ status: "cessato" }], [{ status: "attiva" }])).toBe("attivo");
  });
  it("in costruzione con automazioni in costruzione, canone in attesa o appena creato", () => {
    expect(statoCliente([], [{ status: "in_costruzione" }])).toBe("in_costruzione");
    expect(statoCliente([{ status: "in_attesa" }], [])).toBe("in_costruzione");
    expect(statoCliente([], [])).toBe("in_costruzione");
  });
  it("cessato quando resta solo roba chiusa", () => {
    expect(statoCliente([{ status: "cessato" }], [{ status: "dismessa" }])).toBe("cessato");
    expect(statoCliente([{ status: "in_pausa" }], [])).toBe("cessato");
  });
});

describe("azioni sul canone", () => {
  it("passaggi ammessi con le date giuste", () => {
    expect(prossimoStatoCanone("in_attesa", "attiva", NOW)).toEqual({ campi: { status: "attivo", startAt: NOW } });
    expect(prossimoStatoCanone("attivo", "pausa", NOW)).toEqual({ campi: { status: "in_pausa", pausedAt: NOW } });
    expect(prossimoStatoCanone("in_pausa", "riprendi", NOW)).toEqual({ campi: { status: "attivo", pausedAt: null } });
    expect(prossimoStatoCanone("in_pausa", "cessa", NOW)).toEqual({ campi: { status: "cessato", endAt: NOW } });
  });
  it("passaggi impossibili con una frase chiara", () => {
    expect(prossimoStatoCanone("in_pausa", "pausa", NOW)).toEqual({ errore: "Il canone è in pausa: non si può mettere in pausa" });
    expect(prossimoStatoCanone("cessato", "riprendi", NOW)).toEqual({ errore: "Il canone è cessato: non si può riprendere" });
  });
});

describe("modo anonimo", () => {
  it("settore e città al posto del nome", () => {
    expect(descrizioneAnonima("un'officina meccanica", "Pisa")).toBe("Un'officina meccanica di Pisa");
    expect(descrizioneAnonima("un'agenzia immobiliare", null)).toBe("Un'agenzia immobiliare");
    expect(descrizioneAnonima(null, "Lucca")).toBe("Un cliente di Lucca");
    expect(descrizioneAnonima("  ", null)).toBe("Un cliente");
  });
});
