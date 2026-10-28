import { describe, expect, it } from "vitest";
import { cellaCsv, csvLead, dataCsv, nomeFileCsv } from "../src/pagine/commerciale/esportaLead";
import { Lead } from "../src/pagine/commerciale/Lead";
import { FASI, ORA, riga } from "./b1c-fixture";
import { render } from "./render";

const UTENTI = [{ id: "tommaso", name: "Tommaso Rovini" }];

describe("modifica 21: Esporta CSV e telefono", () => {
  it("CSV per Excel: BOM, separatore ;, CRLF, tutte le colonne, accenti intatti", () => {
    const csv = csvLead([riga("a", { company: "Caffè Città; S.r.l.", setupCents: 150000, feeCents: 9900 }), riga("b", { phone: null })], FASI, UTENTI);
    expect(csv.startsWith("﻿Azienda;Persona;Fase;Da fare;Scadenza;")).toBe(true);
    const righe = csv.split("\r\n");
    expect(righe).toHaveLength(4); // intestazione, due lead, riga vuota finale
    const intestazione = righe[0].replace("﻿", "").split(";");
    for (const c of ["Telefono", "Email", "Punteggio", "Arrivato il", "Tentativi", "Setup (euro)", "Canone mensile (euro)"]) expect(intestazione).toContain(c);
    expect(righe[1]).toContain('"Caffè Città; S.r.l."');
    expect(righe[1]).toContain("Tommaso Rovini");
    expect(righe[1]).toContain(";1500,00;99,00");
    expect(righe[1].split(";").length).toBeGreaterThan(intestazione.length - 1);
  });

  it("celle e date", () => {
    expect(cellaCsv('detto "ciao"')).toBe('"detto ""ciao"""');
    expect(cellaCsv("riga\nnuova")).toBe('"riga\nnuova"');
    expect(cellaCsv(null)).toBe("");
    expect(dataCsv(ORA)).toBe("28/10/2026 10:00");
    expect(nomeFileCsv(ORA)).toBe("lead-2026-10-28.csv");
  });

  it("menu della pagina con Esporta CSV; la lista del telefono ha azienda, scadenza, fase e azione su due righe", () => {
    const html = render(<Lead ora={ORA} />, { percorso: "/commerciale/lead", dati: [[["leads", "tabella"], [riga("a")]], [["stages"], FASI], [["users"], UTENTI]] });
    expect(html).toContain('aria-label="Altre azioni dei lead"');
    const lista = html.slice(html.indexOf('aria-label="Lead"'));
    for (const t of ["Officina a", "domani 10:00", "Da richiamare", "Richiamare: tentativo 2 di 5"]) expect(lista).toContain(t);
  });
});
