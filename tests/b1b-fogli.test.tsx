import { describe, expect, it } from "vitest";
import { ESITI_PER_FASE as ESITI_WORKER } from "../worker/leads/esito";
import { CALL_DELL_ESITO, ESITI_PER_FASE, corpoEsito, esitiPerFase, etichettaScelta, mancaMotivo, statoIniziale, validaEsito } from "../src/pagine/commerciale/esito";
import { CampiMotivo } from "../src/pagine/commerciale/lead/CampiMotivo";
import { render } from "./render";

// Blocco 1, modifiche 12 e 7 (lato scheda): esiti per fase e motivo obbligatorio verso 80.
const ORA = Date.UTC(2026, 9, 28, 9, 0);
const RID = "00000000-0000-4000-8000-000000000001";

describe("esiti per fase, allineati a ESITI_PER_FASE del worker", () => {
  it("la copia dell'interfaccia è quella del worker", () => {
    expect(ESITI_PER_FASE).toBe(ESITI_WORKER);
  });
  it("10 e 20: telefonate con la conoscenza in cima, niente esiti delle call", () => {
    for (const f of ["da-chiamare-prima-volta", "da-richiamare"]) {
      expect(esitiPerFase(f)[0]).toBe("conoscenza_fissata");
      expect(esitiPerFase(f)).not.toContain("offerta_presentata");
      expect(esitiPerFase(f)).not.toContain("conoscenza_fatta");
    }
  });
  it("ogni esito del foglio vale anche per il server, salvo le due voci della scheda", () => {
    for (const [fase, validi] of Object.entries(ESITI_PER_FASE)) {
      const foglio = esitiPerFase(fase).filter((e) => e !== "firmato" && e !== "rimanda");
      expect(new Set(foglio)).toEqual(new Set(validi));
    }
    expect(esitiPerFase("chiuso")).toEqual([]);
  });
  it("in 55 e 60 il passo della tabella in cima; in 40 niente firma", () => {
    expect(esitiPerFase("progetto-fissato").slice(0, 2)).toEqual(["progetto_presentato", "firmato"]);
    expect(esitiPerFase("in-attesa-decisione").slice(0, 3)).toEqual(["firmato", "non_interessato", "rimanda"]);
    expect(esitiPerFase("presentazione-confermata")[0]).toBe("offerta_presentata");
    expect(esitiPerFase("presentazione-confermata")).not.toContain("firmato");
  });
  it("le parole cambiano con la fase", () => {
    expect(etichettaScelta("firmato", "in-attesa-decisione")).toBe("Sì, firma");
    expect(etichettaScelta("non_interessato", "in-attesa-decisione")).toBe("No, non firma");
    expect(etichettaScelta("firmato", "progetto-fissato")).toBe("Ha firmato");
    expect(etichettaScelta("offerta_fissata", "in-attesa-preventivo")).toBe("Offerta pronta: fissa la call dell'offerta");
    expect(etichettaScelta("progetto_fissato", "in-attesa-progetto")).toBe("Progetto pronto: fissa la call del progetto");
    expect(etichettaScelta("non_risponde", "da-richiamare")).toBe("Non risponde");
  });
  it("gli esiti che fissano una call chiedono il tipo giusto; l'offerta presentata chiede l'analisi", () => {
    expect(CALL_DELL_ESITO).toEqual({ conoscenza_fissata: "conoscenza", offerta_fissata: "offerta", analisi_fissata: "analisi", progetto_fissato: "progetto", offerta_presentata: "analisi" });
    const base = { ...statoIniziale(RID, { stageId: "presentazione-confermata" }), esito: "offerta_presentata" as const };
    expect(validaEsito(base, false, ORA)).toBeNull();
    expect(corpoEsito({ ...base, callAt: ORA + 86_400_000 }).call).toEqual({ kind: "analisi", scheduledAt: ORA + 86_400_000, meetLink: null });
    expect(validaEsito({ ...base, esito: "analisi_fissata" }, false, ORA)).toBe("Scegli data e ora della call");
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
    expect(corpoEsito(nonOra)).toEqual({ requestId: RID, esito: "non_interessato", lostReason: "non_ora", recontactAt: ORA + 30 * 86_400_000 });
    expect(corpoEsito(nonOra)).not.toHaveProperty("lostNote");
    const altro = { ...s, lostReason: "altro", lostNote: "Chiude l'attività" };
    expect(corpoEsito(altro)).toMatchObject({ lostReason: "altro", lostNote: "Chiude l'attività" });
    expect(corpoEsito(altro)).not.toHaveProperty("recontactAt");
  });
  it("fase e scadenza non partono: le calcola il server; richiamare porta il giorno detto", () => {
    const s = { ...statoIniziale(RID, { stageId: "da-richiamare" }), esito: "richiamare" as const, stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: ORA, data: ORA + 86_400_000 };
    expect(corpoEsito(s)).toEqual({ requestId: RID, esito: "richiamare", data: ORA + 86_400_000 });
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
