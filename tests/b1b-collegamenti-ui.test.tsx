import { describe, expect, it } from "vitest";
import { Collegamenti } from "../src/pagine/commerciale/lead/Collegamenti";
import { RigaContatto } from "../src/pagine/commerciale/lead/RigaContatto";
import type { Collegamenti as Dati } from "../src/types";
import { render } from "./render";

// Blocco 1, modifiche 14 e 16: sezione Collegamenti della scheda e riga del contatto.
const ORA = Date.UTC(2026, 9, 28, 9, 0);
const vuoti: Dati = { proposte: [], call: [], cliente: null, automazioni: [], canoni: [] };
const pieni: Dati = {
  proposte: [{ id: "P1", number: "ACC-2026-001", status: "accettata", data: ORA, setupCents: 200000, feeCents: 30000 }],
  call: [{ id: "K1", kind: "conoscenza", scheduledAt: ORA - 86_400_000, outcome: "fatta" }],
  cliente: { id: "C1", name: "Officina Prova Srl", dal: ORA },
  automazioni: [{ id: "A1", name: "Ordini", status: "attiva", activatedAt: ORA }],
  canoni: [{ id: "F1", amountCents: 30000, status: "attivo", billingDay: 1, automationId: "A1", automationName: "Ordini" }],
};
const nulla = () => undefined;

describe("Collegamenti", () => {
  it("lead senza cliente: righe grigie, niente azioni di automazioni e canoni", () => {
    const html = render(<Collegamenti dati={vuoti} ora={ORA} onCrea={nulla} />);
    expect(html).toContain("Crea una proposta");
    expect(html).toContain("Fissa una call");
    expect(html).toContain("Diventa cliente quando segni il sì: da lì compaiono automazioni e canoni.");
    expect(html).toContain("Compaiono quando è cliente.");
    expect(html).not.toContain("Crea un&#x27;automazione");
    expect(html).not.toContain("Aggiungi un canone");
  });
  it("cliente: link a proposta, call, cliente, automazione e canoni, con i conteggi", () => {
    const html = render(<Collegamenti dati={pieni} ora={ORA} onCrea={nulla} />);
    for (const href of ["/commerciale/proposte/P1", "/commerciale/call/K1", "/commerciale/clienti/C1", "/automazioni/A1", "/economia/canoni"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("ACC-2026-001, € 2.000, € 300 al mese");
    expect(html).toContain("Cliente dal 28 ottobre");
    expect(html).toContain("Crea un&#x27;automazione");
    expect(html).toContain("Aggiungi un canone");
    expect(html).not.toContain("Compaiono quando è cliente");
    expect(html).toMatch(/Proposte<span[^>]*>1</);
  });
});

describe("riga del contatto", () => {
  it("azienda con Lead e Cliente; il link che manca non c'è", () => {
    const due = render(<RigaContatto contatto={{ azienda: "Officina", leadId: "L1", clienteId: "C1" }} />);
    expect(due).toContain('href="/commerciale/lead/L1"');
    expect(due).toContain('href="/commerciale/clienti/C1"');
    expect(due).toContain("Officina:");
    const solo = render(<RigaContatto contatto={{ azienda: "Officina", leadId: null, clienteId: "C1" }} />);
    expect(solo).not.toContain("/commerciale/lead/");
  });
});

describe("collegamenti di un lead perso", async () => {
  const { Collegamenti } = await import("../src/pagine/commerciale/lead/Collegamenti");
  it("niente promessa del cliente né riga di automazioni e canoni", () => {
    const html = render(<Collegamenti dati={{ proposte: [], call: [], cliente: null, automazioni: [], canoni: [] }} ora={0} perso onCrea={() => undefined} />);
    expect(html).toContain("Nessun cliente");
    expect(html).not.toContain("Diventa cliente");
    expect(html).not.toContain("Compaiono quando è cliente");
  });
});
