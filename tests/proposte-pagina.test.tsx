import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router";
import { DettaglioProposta } from "../src/pagine/commerciale/DettaglioProposta";
import { motivoForbice } from "../src/pagine/commerciale/FoglioProposta";
import { FoglioAccettazione, motivoLinkPdf } from "../src/pagine/commerciale/FoglioProposta";
import { Proposte } from "../src/pagine/commerciale/Proposte";
import { SezioneProposta } from "../src/pagine/commerciale/SezioneProposta";
import type { PropostaRiga } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const p = (id: string, status: PropostaRiga["status"], extra: Partial<PropostaRiga> = {}): PropostaRiga => ({
  id, number: `ACC-2026-${id}`, leadId: "l", company: `Officina ${id}`, status, option: "standard", setupCents: 200_000, feeCents: 15_000, hoursEstimate: 40,
  alternativeCents: null, validUntil: null, forbiceDaCents: null, forbiceACents: null, sentAt: ORA, presentedAt: null, pdfUrl: null, sourcePath: null, objections: null, nextActionAt: ORA + 3 * 86_400_000, version: 1, ...extra,
});

const MODELLO = { id: "mod-follow-up", channel: "email", key: "follow_up_preventivo", title: "Follow-up", subject: "La proposta per {azienda}", body: "Ciao {referente}, la {numero}", stageId: "in-attesa-decisione", sortOrder: 70 };
const LEAD = { lead: { id: "l", company: "Officina 007", contactName: "Luca Bertini", phone: "+393330000001", email: "luca@esempio.it", stageId: "in-attesa-decisione" }, activities: [], documents: [], duplicateOf: null };
const dettaglio = (proposta: PropostaRiga) =>
  render(<Routes><Route path="/commerciale/proposte/:id" element={<DettaglioProposta ora={ORA} />} /></Routes>, {
    percorso: `/commerciale/proposte/${proposta.id}`,
    dati: [[["proposta", proposta.id], { proposta, ricontatti: [ORA + 3 * 86_400_000], storico: [] }], [["lead", "l"], LEAD], [["templates"], [MODELLO]]],
  });

describe("schermata Proposte", () => {
  it("aperte nel titolo, da abbinare in cima, setup e canone su una riga, nessun primario", () => {
    const html = render(<Proposte ora={ORA} />, { dati: [[["proposte"], [p("001", "registrata"), p("002", "bozza"), p("003", "presentata", { leadId: null }), p("004", "accettata")]]] });
    expect(html).toMatch(/Proposte[^<]*<strong[^>]*>3<\/strong> aperte/);
    expect(html).toContain("Da abbinare");
    expect(html).toContain("Abbina a un lead");
    expect(html).toContain("Lead non riconosciuto");
    expect(html).not.toContain("Nessun lead con questo nome");
    expect(html).toContain("Setup € 2.000, canone € 150");
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[^<]*Chiuse/);
    expect(contaPrimari(html)).toBe(0);
  });

  it("nessuna proposta: stato vuoto che dice da dove arrivano", () => {
    expect(render(<Proposte ora={ORA} />, { dati: [[["proposte"], []]] })).toContain("Nessuna proposta");
  });
});

describe("dettaglio della proposta", () => {
  it("registrata: un solo primario, Segna presentata", () => {
    const html = dettaglio(p("005", "registrata"));
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Segna presentata");
    expect(html).toContain("Aggiungi il link al PDF");
  });

  it("presentata col follow-up dovuto: email dal modello compilato (PV3), niente pulsante dentro un link", () => {
    const html = dettaglio(p("007", "presentata", { nextActionAt: ORA - 1000, pdfUrl: "https://esempio.it/p.pdf" }));
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("subject=La%20proposta%20per%20Officina%20007");
    expect(html).toContain("Ciao%20Luca%2C%20la%20ACC-2026-007");
    expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*<button/s);
    expect(html).toContain("Apri il PDF");
    expect(html).toContain("Segna accettata");
  });
});

describe("foglio di accettazione (PV12)", () => {
  it("un selettore per l'opzione accettata, un solo primario", () => {
    const html = render(<FoglioAccettazione proposta={p("008", "presentata", { alternativeCents: 1_400_000 })} onChiudi={() => undefined} />);
    expect(html).toContain("Opzione accettata");
    expect(html).toContain("Standard");
    expect(html).toContain("Setup € 2.000, canone € 150");
    expect(contaPrimari(html)).toBe(1);
    expect(html).not.toContain("<select");
  });
});

describe("sezione proposta nella scheda lead", () => {
  it("numero, prezzo su una riga, dove sta il PDF", () => {
    const html = render(<SezioneProposta leadId="l" />, { dati: [[["lead", "l", "proposte"], [p("009", "registrata")]]] });
    expect(html).toContain("ACC-2026-009");
    expect(html).toContain("Setup € 2.000, canone € 150");
    expect(html).toContain("PDF nel wiki");
  });
});

describe("forbice dell'offerta (modifica 25)", () => {
  it("il dettaglio mostra la forbice su una riga, senza calcoli", () => {
    expect(dettaglio(p("009", "registrata", { forbiceDaCents: 300_000, forbiceACents: 500_000 }))).toContain("Forbice: da € 3.000 a € 5.000");
    expect(dettaglio(p("010", "registrata"))).not.toContain("Forbice");
  });
  it("nel foglio a mano: se c'è un estremo serve l'altro, e il primo non supera il secondo", () => {
    expect(motivoForbice("", "")).toBeUndefined();
    expect(motivoForbice("3000", "")).toBe("Scrivi tutti e due gli estremi della forbice");
    expect(motivoForbice("5000", "3000")).toBe("Il primo estremo non può superare il secondo");
    expect(motivoForbice("3000", "5000")).toBeUndefined();
  });
});

describe("link al PDF", () => {
  it("solo https://, vuoto ammesso dove è facoltativo", () => {
    expect(motivoLinkPdf("javascript:alert(1)")).toBe("Il link deve iniziare con https://");
    expect(motivoLinkPdf("http://esempio.it/p.pdf")).toBe("Il link deve iniziare con https://");
    expect(motivoLinkPdf("https://esempio.it/p.pdf")).toBeUndefined();
    expect(motivoLinkPdf("  ")).toBeUndefined();
  });
});
