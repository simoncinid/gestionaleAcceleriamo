import { describe, expect, it } from "vitest";
import { corpoEsito, statoIniziale, testoTentativo, validaEsito } from "../src/pagine/commerciale/esito";
import { riprendiChiamata, segnaChiamata } from "../src/pagine/commerciale/chiamata";

const RID = "7b0c1f3e-2a4d-4c5e-9f6a-1b2c3d4e5f60";

describe("Foglio Esito, logica", () => {
  it("contatore dei tentativi", () => {
    expect(testoTentativo(0)).toBe("Tentativo 1 di 5");
    expect(testoTentativo(1)).toBe("Tentativo 2 di 5");
    expect(testoTentativo(7)).toBe("Tentativo 5 di 5");
  });

  it("senza esito non si salva; appuntamento chiede data della call; le perse chiedono il motivo", () => {
    const s = statoIniziale(RID, { stageId: "da-richiamare" });
    expect(validaEsito(s, false)).toBe("Scegli un esito");
    expect(validaEsito({ ...s, esito: "appuntamento" }, false)).toBe("Scegli data e ora della call");
    expect(validaEsito({ ...s, esito: "non_interessato", stageId: "non-chiuso" }, true)).toBe("Scegli il motivo");
    expect(validaEsito({ ...s, esito: "non_risponde" }, false)).toBeNull();
  });

  it("il corpo porta sempre lo stesso requestId e la call solo con l'appuntamento", () => {
    const s = { ...statoIniziale(RID, { stageId: "da-richiamare" }), esito: "non_risponde" as const, nextAction: "Seconda chiamata", nextActionAt: 1_800_000_000_000 };
    // Fase e scadenza le calcola il server (blocco 1, modifica 12): il corpo non le porta.
    expect(corpoEsito(s)).toEqual({ requestId: RID, esito: "non_risponde" });
    const a = { ...s, esito: "appuntamento" as const, callAt: 1_800_100_000_000, meetLink: " https://meet.google.com/abc-defg-hij " };
    expect(corpoEsito(a).call).toEqual({ kind: "conoscenza", scheduledAt: 1_800_100_000_000, meetLink: "https://meet.google.com/abc-defg-hij" });
    expect(corpoEsito(a).requestId).toBe(RID);
  });
});

describe("ritorno dalla chiamata", () => {
  const archivio = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it("riapre il lead una volta sola", () => {
    const a = archivio();
    segnaChiamata(a, "lead-1", 1000);
    expect(riprendiChiamata(a, 5000)).toBe("lead-1");
    expect(riprendiChiamata(a, 6000)).toBeNull();
  });
  it("dopo due ore non riapre", () => {
    const a = archivio();
    segnaChiamata(a, "lead-1", 0);
    expect(riprendiChiamata(a, 2 * 3_600_000 + 1)).toBeNull();
  });
});
