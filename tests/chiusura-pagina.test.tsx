import { describe, expect, it } from "vitest";
import { SchedaLead } from "../src/pagine/commerciale/SchedaLead";
import { euroPerCampo, precompilaChiusura } from "../src/pagine/commerciale/scheda";
import type { LeadDetail, Stage } from "../src/types";
import { prossimaAzione } from "../worker/processo/processo";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const fase = (id: string, label: string, sortOrder: number, kind: Stage["kind"] = "open"): Stage =>
  ({ id, label, sortOrder, kind, tone: "neutro", probability: 10, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: kind === "lost" });
const FASI = [fase("da-richiamare", "Da richiamare", 30), fase("chiuso", "Chiuso", 90, "won"), fase("fake", "Fake", 120, "lost")];

const dettaglio = (stageId: string, cliente: LeadDetail["cliente"]) => conProssima({
  lead: {
    id: "abc", company: "Officina Prova", contactName: null, email: null, phone: "+393330000001", source: "manuale",
    metaCampaign: null, metaStatus: null, stageId, stageChangedAt: ORA, estimatedValue: null, ownerId: null,
    nextAction: null, nextActionAt: null, appointmentAt: null, duplicateOfId: null, createdAt: ORA, updatedAt: ORA, deletedAt: null,
    attemptCount: 0, score: "verde", setupCents: 250_000, feeCents: 30_000, sequenceStep: 0,
    website: null, linkedinText: null, metaLeadId: null, metaAnswers: null, metaAdset: null, metaAd: null, meetLink: null, proposalUrl: null, notes: null, createdBy: null,
    confirmationSentAt: null, confirmationAttempts: 0, confirmationError: null,
  },
  activities: [], documents: [], duplicateOf: null, cliente,
}) ;
// Il lead arriva dall'API con la riga "Da fare" già calcolata (prossimaAzione sul server).
function conProssima(d: object): LeadDetail {
  const x = d as unknown as LeadDetail;
  return { ...x, lead: { ...x.lead, prossima: prossimaAzione(x.lead as unknown as Parameters<typeof prossimaAzione>[0], ORA) } };
}

describe("Q6: foglio di Chiuso precompilato", () => {
  it("euro nel formato dei campi", () => {
    expect(euroPerCampo(250_000)).toBe("2.500");
    expect(euroPerCampo(180_050)).toBe("1.800,50");
    expect(euroPerCampo(0)).toBe("0");
    expect(euroPerCampo(null)).toBe("");
  });
  it("prima la proposta accettata, poi i soldi del lead, il nome dall'azienda", () => {
    const lead = { company: "Ferri Srl", setupCents: 100_000, feeCents: 10_000 };
    const accettata = { status: "accettata", option: "standard", setupCents: 250_000, feeCents: 30_000 };
    const rifiutata = { status: "rifiutata", option: "standard", setupCents: 900_000, feeCents: 90_000 };
    expect(precompilaChiusura(lead, [rifiutata, accettata])).toEqual({ setup: "2.500", canone: "300", nome: "Ferri Srl" });
    expect(precompilaChiusura(lead, [rifiutata])).toEqual({ setup: "1.000", canone: "100", nome: "Ferri Srl" });
    expect(precompilaChiusura({ ...lead, setupCents: null, feeCents: null })).toEqual({ setup: "", canone: "", nome: "Ferri Srl" });
    expect(precompilaChiusura(lead, [{ ...accettata, option: "proprieta", feeCents: null }]).canone).toBe("0");
  });
});

describe("Q15: scheda di un lead chiuso", () => {
  it("vinto: l'unica azione in accento è Apri il cliente", () => {
    const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], dettaglio("chiuso", { id: "cli1", name: "Officina Prova" })], [["stages"], FASI]] });
    expect(html).toContain(">Apri il cliente<");
    expect(html).toContain("Chiuso come cliente il");
    expect(html).toContain('href="/commerciale/clienti/cli1"');
    expect(contaPrimari(html)).toBe(1);
  });
  it("perso: nessuna azione in accento", () => {
    const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], dettaglio("fake", null)], [["stages"], FASI]] });
    expect(html).not.toContain("Apri il cliente<");
    expect(contaPrimari(html)).toBe(0);
  });
  it("aperto: Chiama resta l'azione in accento", () => {
    const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], dettaglio("da-richiamare", null)], [["stages"], FASI]] });
    expect(contaPrimari(html)).toBe(1);
  });
});

describe("Scheda lead: voci 30 e 41", () => {
  const scheda = (stageId: string, cliente: LeadDetail["cliente"], lead: object = {}) => {
    const d = dettaglio(stageId, cliente);
    return render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], conProssima({ ...d, lead: { ...d.lead, ...lead } })], [["stages"], FASI]] });
  };
  it("30: vinto senza cliente, l'unica azione in accento è Crea il cliente", () => {
    const html = scheda("chiuso", null);
    expect(html).toContain(">Crea il cliente<");
    expect(html).not.toContain("Apri il cliente<");
    expect(contaPrimari(html)).toBe(1);
  });
  it("41: freccia per tornare indietro, telefono ed email come link", () => {
    const html = scheda("da-richiamare", null, { email: "luca@esempio.it" });
    expect(html).toContain('aria-label="Torna indietro"');
    expect(html).toContain('href="tel:+393330000001"');
    expect(html).toContain('href="mailto:luca@esempio.it"');
  });
});
