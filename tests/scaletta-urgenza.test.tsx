import { describe, expect, it } from "vitest";
import { Scaletta } from "../src/pagine/commerciale/Scaletta";
import { MAX_SELEZIONE, TUTTE, aggiungiAllaSelezione, fonteFase, listaTelefono, perFase, perUrgenza } from "../src/pagine/commerciale/filtriScaletta";
import { arrivato } from "../src/format";
import type { LeadListItem, Stage } from "../src/types";
import { contaPrimari, render } from "./render";

// 13 ottobre 2026, 10:00 a Roma.
const ORA = Date.UTC(2026, 9, 13, 8, 0);
const MIN = 60_000;
const fase = (id: string, label: string, sortOrder: number): Stage =>
  ({ id, label, sortOrder, kind: "open", tone: "neutro", probability: 10, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: false });
const FASI = [fase("da-chiamare-prima-volta", "Da chiamare", 10), fase("da-richiamare", "Da richiamare", 30)];
const lead = (id: string, stageId: string, nextActionAt: number | null, createdAt: number): LeadListItem => ({
  id, company: `Officina ${id}`, contactName: null, email: null, phone: "+393330000001", source: "meta", metaCampaign: null, metaStatus: null,
  stageId, stageChangedAt: ORA, estimatedValue: null, ownerId: null, nextAction: "Richiamare", nextActionAt, appointmentAt: null,
  duplicateOfId: null, createdAt, updatedAt: ORA, deletedAt: null, attemptCount: 0, score: null, setupCents: null, feeCents: null, sequenceStep: 0,
});

describe("Q12: Scaletta sul telefono", () => {
  it("ordina per urgenza: scadute, poi scadenza crescente, senza scadenza in fondo, a parità l'arrivo", () => {
    const leads = [
      lead("futura", "da-chiamare-prima-volta", ORA + 60 * MIN, ORA - 10 * MIN),
      lead("senza", "da-chiamare-prima-volta", null, ORA - 99 * MIN),
      lead("scaduta", "da-richiamare", ORA - 30 * MIN, ORA - 5 * MIN),
      lead("pari-dopo", "da-richiamare", ORA + 60 * MIN, ORA - 1 * MIN),
      lead("molto-scaduta", "da-richiamare", ORA - 300 * MIN, ORA),
    ];
    expect(perUrgenza(leads).map((l) => l.id)).toEqual(["molto-scaduta", "scaduta", "futura", "pari-dopo", "senza"]);
    expect(listaTelefono(TUTTE, FASI, perFase(leads)).map((l) => l.id)).toEqual(["molto-scaduta", "scaduta", "futura", "pari-dopo", "senza"]);
  });
  it("riga fonte · fase", () => {
    expect(fonteFase("Meta", "Da richiamare")).toBe("Meta · Da richiamare");
    expect(fonteFase("Meta", "")).toBe("Meta");
  });
  it("ogni card ha Chiama e la riga fonte · fase, nessun primario", () => {
    const html = render(<Scaletta ora={ORA} />, { dati: [[["leads", ""], [lead("a", "da-richiamare", ORA + MIN, ORA)]], [["stages"], FASI], [["users"], []]] });
    expect(html).toContain("Meta · Da richiamare");
    expect(html).toContain('href="tel:+393330000001"');
    expect(contaPrimari(html)).toBe(0);
  });
  it("selezione multipla al massimo 15", () => {
    let s = new Set<string>();
    for (let i = 0; i < 20; i++) s = aggiungiAllaSelezione(s, `l${i}`);
    expect(s.size).toBe(MAX_SELEZIONE);
    expect(MAX_SELEZIONE).toBe(15);
  });
});

describe("Q13: colonna Arrivato", () => {
  it("oggi e ieri con l'ora, poi giorno e mese", () => {
    expect(arrivato(Date.UTC(2026, 9, 13, 6, 42), ORA)).toBe("oggi 08:42");
    expect(arrivato(Date.UTC(2026, 9, 12, 7, 10), ORA)).toBe("ieri 09:10");
    expect(arrivato(Date.UTC(2026, 9, 3, 10, 0), ORA)).toBe("3 ott");
    expect(arrivato(Date.UTC(2025, 9, 3, 10, 0), ORA)).toBe("3 ott 2025");
  });
});
