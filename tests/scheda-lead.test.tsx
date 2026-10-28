import { describe, expect, it } from "vitest";
import { SchedaLead } from "../src/pagine/commerciale/SchedaLead";
import { compila, modelliDelCanale, modelloPer } from "../src/pagine/commerciale/modelli";
import { LeadForm, corpoDati, statoDati } from "../src/pagine/commerciale/lead/LeadForm";
import { poiSeRiesce, type Salva } from "../src/pagine/commerciale/lead/salvataggi";
import { centesimi, confermaNonPartita, idPerPreventivo, provenienza } from "../src/pagine/commerciale/scheda";
import { MAX_TENTATIVI_CONFERMA } from "../worker/email/conferma";
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
    // Un solo punto con una o due cifre in fondo, senza virgola: è il decimale.
    expect(centesimi("1234.5")).toBe(123_450);
    expect(centesimi("150.50")).toBe(15_050);
    expect(centesimi("1.234")).toBe(123_400);
    expect(centesimi("1.234,50")).toBe(123_450);
    expect(centesimi("1234,5")).toBe(123_450);
    expect(centesimi("1.234.567")).toBe(123_456_700);
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

describe("scheda lead, pagina (struttura B2, modifica 10)", () => {
  const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], DETTAGLIO], [["stages"], FASI]] });
  it("una sola azione primaria, Chiama col nome", () => {
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Chiama Luca");
    expect(html).toMatch(/data-selettore="Fase"(?:(?!<\/button>).)*>Da richiamare</s);
  });
  it("cinque sezioni con titolo più Assistente, nessuna fisarmonica salvo la ricerca", () => {
    for (const titolo of ["Da fare", "Contatti", "Dati del lead", "Storico", "Assistente"]) expect(html).toContain(`>${titolo}</h2>`);
    expect((html.match(/<details/g) ?? []).length).toBe(1);
    expect(html).toContain("Ricerca sull&#x27;azienda");
    expect(html).toContain("Le altre funzioni arrivano con il blocco 7");
    for (const via of ["Note e dati", "Risposte del modulo</span>", "Doppioni", "Scheda azienda di Claude"]) expect(html).not.toContain(via);
  });
  it("intestazione pulita: pillola della fase, niente provenienza né responsabile ripetuti", () => {
    expect(html).toContain('aria-label="Fase: Da richiamare. Cambia fase"');
    expect(html).not.toContain("Dal Foglio Andrea");
    expect(html).not.toContain("Responsabile:");
    // Fonte e campagna una volta sola, in Dati del lead.
    expect(html.match(/>Autunno</g)?.length).toBe(1);
  });
  it("doppione come avviso in cima solo quando c'è", () => {
    expect(html).not.toContain("Possibile doppione");
    const doppio = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], { ...DETTAGLIO, duplicateOf: { id: "x1", company: "Officina Gemella" } }], [["stages"], FASI]] });
    expect(doppio).toContain("Possibile doppione di Officina Gemella:");
    expect(doppio).toContain('href="/commerciale/lead/x1"');
  });
  it("PV11: niente select del browser, WhatsApp con la sua etichetta", () => {
    expect(html).not.toContain("<select");
    expect(html).toContain('aria-label="Scrivi su WhatsApp"');
    expect(html).not.toMatch(/[–—]/);
  });
});

// Il pool Workers rende solo lato server (niente DOM per digitare): il comportamento si prova sulla logica che lo decide.
const salvaFinto = (riesce: boolean) => {
  const chiamate: Record<string, unknown>[] = [];
  const salva: Salva = (corpo, opzioni) => { chiamate.push(corpo); if (riesce) opzioni?.onSuccess?.(); };
  return { salva, chiamate };
};

describe("scheda lead, correzioni della revisione", () => {
  it("il modulo dati si rimonta solo dopo il suo salvataggio riuscito, non per gli altri salvataggi", () => {
    let versione = 0;
    const ok = salvaFinto(true);
    poiSeRiesce(ok.salva, () => { versione += 1; })({ company: "Officina" });
    expect(versione).toBe(1);
    const ko = salvaFinto(false);
    poiSeRiesce(ko.salva, () => { versione += 1; })({ company: "Officina" });
    expect(versione).toBe(1);
    // Un altro salvataggio della scheda (fase, prossima azione) cambia updatedAt ma non la versione: il testo scritto resta.
    const lead = DETTAGLIO.lead;
    const scritto = { ...statoDati(lead), note: "Testo scritto a mano" };
    const dopoAltroSalvataggio = { ...lead, updatedAt: lead.updatedAt + 60_000 };
    expect(dopoAltroSalvataggio.updatedAt).not.toBe(lead.updatedAt);
    expect(corpoDati(scritto).notes).toBe("Testo scritto a mano");
    // Il modulo ora vive nel foglio "Modifica dati" (menu "..."): si prova da solo.
    const html = render(<LeadForm lead={dopoAltroSalvataggio} users={[]} ora={ORA} onSave={() => undefined} pending={false} />);
    expect(html).toContain("Salva i dati");
  });
  it("la prossima azione resta in modifica se il server rifiuta", () => {
    let aperto = true;
    const ko = salvaFinto(false);
    poiSeRiesce(ko.salva, () => { aperto = false; })({ nextAction: "Richiamare", nextActionAt: ORA });
    expect(ko.chiamate).toHaveLength(1);
    expect(aperto).toBe(true);
    const ok = salvaFinto(true);
    poiSeRiesce(ok.salva, () => { aperto = false; })({ nextAction: "Richiamare", nextActionAt: ORA });
    expect(aperto).toBe(false);
  });
  it("spec 18: valore stimato, appuntamento, link Meet e preventivo solo in lettura", () => {
    const corpo = corpoDati(statoDati(DETTAGLIO.lead));
    for (const k of ["estimatedValue", "appointmentAt", "meetLink", "proposalUrl"]) expect(corpo).not.toHaveProperty(k);
    expect(corpo).toMatchObject({ company: "Officina Prova", contactName: "Luca Prova", ownerId: "tommaso" });
    const conDati = { ...DETTAGLIO, lead: { ...DETTAGLIO.lead, estimatedValue: 2400, meetLink: "https://meet.google.com/abc", appointmentAt: ORA + 86_400_000, proposalUrl: null } };
    const html = render(<LeadForm lead={conDati.lead} users={[]} ora={ORA} onSave={() => undefined} pending={false} />);
    expect(html).toContain(">Valore stimato</dt>");
    expect(html).toContain(">Link Meet</dt>");
    expect(html).toContain(">Consulenza</dt>");
    expect(html).not.toContain(">Link preventivo</dt>");
    for (const etichetta of ["Link Meet", "Link preventivo", "Appuntamento", "Valore stimato (euro)"]) expect(html).not.toContain(`>${etichetta}</label>`);
    const senza = render(<LeadForm lead={DETTAGLIO.lead} users={[]} ora={ORA} onSave={() => undefined} pending={false} />);
    expect(senza).not.toContain("Dati di sola lettura");
  });
});

describe("scheda lead, email di conferma", () => {
  it("la regola del frontend è la stessa del Worker", () => {
    expect(confermaNonPartita({ confirmationSentAt: null, confirmationAttempts: MAX_TENTATIVI_CONFERMA })).toBe(true);
    expect(confermaNonPartita({ confirmationSentAt: null, confirmationAttempts: MAX_TENTATIVI_CONFERMA - 1 })).toBe(false);
    expect(confermaNonPartita({ confirmationSentAt: ORA, confirmationAttempts: MAX_TENTATIVI_CONFERMA })).toBe(false);
  });
  it("tentativi finiti: avviso su due righe, nessun pulsante in più", () => {
    const fallita = { ...DETTAGLIO, lead: { ...DETTAGLIO.lead, confirmationAttempts: 4, confirmationError: "Indirizzo email rifiutato da Resend" } };
    const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], fallita], [["stages"], FASI]] });
    expect(html).toContain("Email di conferma non partita</span>");
    expect(html).toContain("Indirizzo email rifiutato da Resend");
    expect(contaPrimari(html)).toBe(1);
    const normale = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], DETTAGLIO], [["stages"], FASI]] });
    expect(normale).not.toContain("Email di conferma non partita");
  });
});

describe("QA Task 15: telefono ed email nella scheda lead", () => {
  it("i link di telefono ed email sono bersagli da 44 px di altezza", () => {
    const conContatti = { ...DETTAGLIO, lead: { ...DETTAGLIO.lead, phone: "+39 000 1234567", email: "luca@esempio.invalid" } };
    const html = render(<SchedaLead id="abc" ora={ORA} />, { dati: [[["lead", "abc"], conContatti], [["stages"], FASI]] });
    for (const href of ["tel:", "mailto:"]) {
      const a = html.match(new RegExp(`<a class="([^"]*)" href="${href}`)) ?? html.match(new RegExp(`<a href="${href}[^"]*"[^>]*class="([^"]*)"`));
      expect(a?.[1]).toMatch(/\bmin-h-11\b/);
    }
  });
});
