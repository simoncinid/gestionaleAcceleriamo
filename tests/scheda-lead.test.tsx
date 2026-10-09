import { describe, expect, it } from "vitest";
import { SchedaLead } from "../src/pagine/commerciale/SchedaLead";
import { compila, modelliDelCanale, modelloPer } from "../src/pagine/commerciale/modelli";
import { centesimi, idPerPreventivo, provenienza } from "../src/pagine/commerciale/scheda";
import type { MessageTemplate } from "../worker/db/schema";
import type { LeadDetail, Stage } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const fase = (id: string, label: string, sortOrder: number, kind: Stage["kind"] = "open"): Stage =>
  ({ id, label, sortOrder, kind, tone: "neutro", probability: 10, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: kind === "lost" });
const FASI = [fase("da-chiamare-prima-volta", "Da chiamare", 10), fase("da-richiamare", "Da richiamare", 30), fase("chiuso", "Chiuso", 90, "won"), fase("fake", "Fake", 120, "lost")];

const DETTAGLIO = {
  lead: {
    id: "abc", company: "Officina Prova", contactName: "Luca Prova", email: "luca@esempio.it", phone: "+393330000001", source: "foglio_andrea",
    metaCampaign: "Autunno", metaStatus: null, stageId: "da-richiamare", stageChangedAt: ORA, estimatedValue: null, ownerId: "tommaso",
    nextAction: "Seconda chiamata", nextActionAt: ORA + 3_600_000, appointmentAt: null, duplicateOfId: null, createdAt: ORA, updatedAt: ORA, deletedAt: null,
    attemptCount: 1, score: "verde", setupCents: 200_000, feeCents: 30_000, sequenceStep: 1,
    website: null, linkedinText: null, metaLeadId: null, metaAnswers: null, metaAdset: null, metaAd: null, meetLink: null, proposalUrl: null, notes: null, createdBy: null,
    confirmationSentAt: null, confirmationAttempts: 0, confirmationError: null,
  },
  activities: [{ id: "a1", type: "esito", body: "Non risponde", createdAt: ORA - 1000, authorId: "tommaso", authorName: "Tommaso" }],
  documents: [], duplicateOf: null,
} as unknown as LeadDetail;

const modello = (id: string, channel: "whatsapp" | "email", key: string | null, stageId: string | null): MessageTemplate =>
  ({ id, channel, key, title: id, subject: "Ciao {azienda}", body: "Ciao {referente} di {azienda}", stageId, sortOrder: 0 });

describe("scheda lead, logica", () => {
  it("provenienza in una riga", () => {
    expect(provenienza({ source: "meta", metaCampaign: "Autunno" })).toBe("Da Meta, campagna Autunno");
    expect(provenienza({ source: "foglio_andrea", metaCampaign: "Autunno" })).toBe("Dal Foglio Andrea, campagna Autunno");
    expect(provenienza({ source: "manuale", metaCampaign: null })).toBe("Inserito a mano");
  });
  it("legge gli euro scritti all'italiana", () => {
    expect(centesimi("1.800")).toBe(180_000);
    expect(centesimi("1.800,50")).toBe(180_050);
    expect(centesimi("300")).toBe(30_000);
    expect(centesimi("")).toBeNull();
    expect(centesimi("abc")).toBeNull();
  });
  it("id da incollare nel preventivo (spec 6.8)", () => {
    expect(idPerPreventivo("abc")).toBe("lead: abc");
  });
  it("PV3: modelli dal modulo condiviso, quello della fase in cima, solo del canale", () => {
    const elenco = [modello("m1", "whatsapp", "non_ti_ho_trovato", null), modello("m2", "whatsapp", null, "da-richiamare"), modello("m3", "email", "ti_ho_cercato", null)];
    expect(modelliDelCanale(elenco, "whatsapp", "da-richiamare").map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(modelliDelCanale(elenco, "email", "da-richiamare").map((m) => m.id)).toEqual(["m3"]);
    expect(modelloPer(elenco, "whatsapp", null, "non_ti_ho_trovato")?.id).toBe("m1");
    expect(compila("Ciao {referente} di {azienda}", { contactName: "Luca Prova", company: "Officina" })).toBe("Ciao Luca di Officina");
  });
});

describe("scheda lead, pagina", () => {
  const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], DETTAGLIO], [["stages"], FASI]] });
  it("una sola azione primaria, Chiama col nome", () => {
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Chiama Luca");
    expect(html).toContain("Dal Foglio Andrea, campagna Autunno");
    expect(html).toContain("Tentativo 2 di 5");
    expect(html).toContain("€ 2.000");
    expect(html).toMatch(/data-selettore="Fase"(?:(?!<\/button>).)*>Da richiamare</s);
    expect(html).toContain('data-sezione="call"');
    expect(html).toContain('data-sezione="proposta"');
  });
  it("PV11: niente select del browser, WhatsApp con la sua etichetta", () => {
    expect(html).not.toContain("<select");
    expect(html).toContain('aria-label="Scrivi su WhatsApp"');
    expect(html).not.toMatch(/[–—]/);
  });
});
