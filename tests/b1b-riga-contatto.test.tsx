import { describe, expect, it } from "vitest";
import { ContattoDalCliente, ContattoDalLead } from "../src/pagine/commerciale/lead/ContattoDa";
import { RigaContatto } from "../src/pagine/commerciale/lead/RigaContatto";
import { render } from "./render";

// Blocco 1, modifica 16: la stessa riga "<azienda>: Lead, Cliente" in proposta, call, automazione e canone.
describe("riga del contatto", () => {
  it("due link quando c'è il cliente, uno solo prima", () => {
    const due = render(<RigaContatto contatto={{ azienda: "Officina Prova", leadId: "L1", clienteId: "C1" }} />);
    expect(due).toContain("Officina Prova:");
    expect(due).toContain('href="/commerciale/lead/L1"');
    expect(due).toContain('href="/commerciale/clienti/C1"');
    const uno = render(<RigaContatto contatto={{ azienda: "Solo Lead", leadId: "L2", clienteId: null }} />);
    expect(uno).not.toContain("/commerciale/clienti/");
    expect(render(<RigaContatto contatto={{ azienda: "Nessuno", leadId: null, clienteId: null }} />)).not.toContain("Nessuno:");
  });
  it("dal lead ricava il cliente dai collegamenti", () => {
    const html = render(<ContattoDalLead leadId="L1" azienda="Officina Prova" />, { dati: [[["lead", "L1", "collegamenti"], { proposte: [], call: [], cliente: { id: "C1", name: "Officina Prova", dal: 0 }, automazioni: [], canoni: [], inviti: [] }]] });
    expect(html).toContain('href="/commerciale/clienti/C1"');
    expect(html).toContain('href="/commerciale/lead/L1"');
  });
  it("dal cliente ricava il lead di origine", () => {
    const html = render(<ContattoDalCliente clienteId="C1" azienda="Officina Prova" />, { dati: [[["clienti", "C1"], { lead: { id: "L1", company: "Officina Prova" } }]] });
    expect(html).toContain('href="/commerciale/lead/L1"');
    expect(render(<ContattoDalCliente clienteId="C2" azienda="Diretto" />, { dati: [[["clienti", "C2"], { lead: null }]] })).not.toContain("/commerciale/lead/");
  });
});

describe("dal canone all'automazione", async () => {
  const { Canoni } = await import("../src/pagine/economia/Canoni");
  it("ogni canone con automazione ha il link, fuori dal pulsante della riga", () => {
    const html = render(<Canoni ora={0} />, { dati: [[["economia", "canoni"], [{ id: "F1", clientId: "C1", automationId: "A1", amountCents: 30000, billingDay: 1, status: "attivo", cliente: "Officina Prova" }]]] });
    expect(html).toContain('href="/automazioni/A1"');
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*href="\/automazioni\/A1"/s);
  });
});
