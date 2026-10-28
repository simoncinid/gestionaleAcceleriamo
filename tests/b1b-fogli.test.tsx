import { describe, expect, it } from "vitest";
import { corpoEsito, esitiPerFase, etichettaScelta, mancaMotivo, statoIniziale, validaEsito } from "../src/pagine/commerciale/esito";
import { CampiMotivo } from "../src/pagine/commerciale/lead/CampiMotivo";
import { render } from "./render";

// Blocco 1, modifiche 12 e 7 (lato scheda): esiti per fase e motivo obbligatorio verso 80.
const ORA = Date.UTC(2026, 9, 28, 9, 0);
const RID = "00000000-0000-4000-8000-000000000001";

describe("esiti per fase, dalla tabella del contratto", () => {
  it("10 e 20: telefonate, niente esiti delle call", () => {
    for (const f of ["da-chiamare-prima-volta", "da-richiamare"]) {
      expect(esitiPerFase(f)).toEqual(["appuntamento", "non_risponde", "occupato", "richiamare", "non_interessato", "fuori_target"]);
      expect(esitiPerFase(f)).not.toContain("presentazione_fatta");
      expect(esitiPerFase(f)).not.toContain("consulenza_fatta");
    }
  });
  it("30, 40, 50, 60", () => {
    expect(esitiPerFase("appuntamento-confermato")).toEqual(["consulenza_fatta", "non_interessato", "fuori_target"]);
    expect(esitiPerFase("in-attesa-preventivo")).toEqual(["presentazione_fissata", "non_interessato"]);
    expect(esitiPerFase("presentazione-confermata")).toEqual(["presentazione_fatta", "firmato", "non_interessato"]);
    expect(esitiPerFase("in-attesa-decisione")).toEqual(["firmato", "non_interessato", "rimanda"]);
  });
  it("le parole cambiano con la fase", () => {
    expect(etichettaScelta("firmato", "in-attesa-decisione")).toBe("Sì, firma");
    expect(etichettaScelta("non_interessato", "in-attesa-decisione")).toBe("No, non firma");
    expect(etichettaScelta("firmato", "presentazione-confermata")).toBe("Ha firmato");
    expect(etichettaScelta("presentazione_fissata", "in-attesa-preventivo")).toBe("Preventivo pronto: fissa la presentazione");
    expect(etichettaScelta("non_risponde", "da-richiamare")).toBe("Non risponde");
  });
});

describe("motivo verso 80", () => {
  const m = (lostReason: string | null, x: { lostNote?: string; recontactAt?: number | null } = {}) => ({ lostReason, lostNote: x.lostNote ?? "", recontactAt: x.recontactAt ?? null });
  it("manca il motivo, il giorno di non_ora, il testo di altro", () => {
    expect(mancaMotivo(m(null), ORA)).toBe("Scegli il motivo");
    expect(mancaMotivo(m("non_ora"), ORA)).toBe("Scegli il giorno in cui risentirlo");
    expect(mancaMotivo(m("non_ora", { recontactAt: ORA - 1 }), ORA)).toBe("Scegli il giorno in cui risentirlo");
    expect(mancaMotivo(m("non_ora", { recontactAt: ORA + 86_400_000 }), ORA)).toBeNull();
    expect(mancaMotivo(m("altro", { lostNote: "  " }), ORA)).toBe("Scrivi il motivo");
    expect(mancaMotivo(m("prezzo"), ORA)).toBeNull();
  });
  it("il corpo dell'esito porta lostNote e recontactAt solo quando servono", () => {
    const s = { ...statoIniziale(RID, { stageId: "da-richiamare" }), esito: "non_interessato" as const, stageId: "non-chiuso" };
    expect(validaEsito(s, true, ORA)).toBe("Scegli il motivo");
    const nonOra = { ...s, lostReason: "non_ora", recontactAt: ORA + 30 * 86_400_000 };
    expect(validaEsito(nonOra, true, ORA)).toBeNull();
    expect(corpoEsito(nonOra)).toMatchObject({ esito: "non_interessato", stageId: "non-chiuso", lostReason: "non_ora", recontactAt: ORA + 30 * 86_400_000 });
    expect(corpoEsito(nonOra)).not.toHaveProperty("lostNote");
    const altro = { ...s, lostReason: "altro", lostNote: "Chiude l'attività" };
    expect(corpoEsito(altro)).toMatchObject({ lostReason: "altro", lostNote: "Chiude l'attività" });
    expect(corpoEsito(altro)).not.toHaveProperty("recontactAt");
  });
  it("i campi chiedono il giorno solo per non_ora e il testo solo per altro", () => {
    const nonOra = render(<CampiMotivo valore={m("non_ora")} onCambia={() => undefined} />);
    expect(nonOra).toContain("Quando risentirlo");
    expect(nonOra).not.toContain("in due parole");
    const altro = render(<CampiMotivo valore={m("altro")} onCambia={() => undefined} />);
    expect(altro).toContain("Il motivo, in due parole");
    expect(altro).not.toContain("Quando risentirlo");
  });
});
