import { describe, expect, it } from "vitest";
import { fileNonAmmesso, peso } from "../src/carica";
import { Documents } from "../src/pagine/commerciale/lead/Documents";
import { DatiLead } from "../src/pagine/commerciale/lead/DatiLead";
import type { DocumentRow, Lead } from "../src/types";
import { contaPrimari, render } from "./render";

// Spec documenti 29/10/2026: foglio Documenti e pallino sulla voce Documenti della scheda.
const ORA = Date.UTC(2026, 9, 29, 10);
const file: DocumentRow = { id: "D1", leadId: "L1", name: "offerta.pdf", url: null, createdAt: ORA - 3_600_000, updatedAt: ORA - 60_000, file: true, version: 2, size: 1_500_000, authorName: "Tommaso", mime: "application/pdf" };
const link: DocumentRow = { id: "D2", leadId: "L1", name: "Cartella Drive", url: "https://drive.google.com/x", createdAt: ORA - 7_200_000 };

describe("foglio Documenti", () => {
  it("una sola azione primaria, file aperti dal Worker, versioni e novità segnate", () => {
    const html = render(<Documents leadId="L1" documents={[file, link]} ora={ORA} nuovi={["D1"]} />);
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Carica file");
    expect(html).toContain('href="/api/documents/D1/file"');
    expect(html).toContain('href="/api/documents/D1/file?scarica=1"');
    expect(html).toContain('href="https://drive.google.com/x"');
    expect(html).toContain("Versione 2 · 1,4 MB · Tommaso");
    expect(html).not.toMatch(/claude/i);
    expect(html).toContain("Nuovo");
    expect(html).toContain("Nuova versione");
    expect(html).toContain("Versioni precedenti");
    expect(html).not.toMatch(/[—–]/);
  });

  it("vuoto: invita a caricare, il link resta possibile", () => {
    const html = render(<Documents leadId="L1" documents={[]} ora={ORA} />);
    expect(html).toContain("Nessun documento.");
    expect(html).toContain("Aggiungi un link");
  });

  it("controlli prima di caricare: tipo, vuoto, 100 MB", () => {
    const f = (nome: string, byte: number) => ({ name: nome, size: byte }) as File;
    expect(fileNonAmmesso(f("a.pdf", 10))).toBeNull();
    expect(fileNonAmmesso(f("voce.M4A", 10))).toBeNull();
    expect(fileNonAmmesso(f("a.html", 10))).toMatch(/tipo non ammesso/);
    expect(fileNonAmmesso(f("a.pdf", 0))).toMatch(/vuoto/);
    expect(fileNonAmmesso(f("a.pdf", 100 * 1024 * 1024 + 1))).toMatch(/100 MB/);
    expect(peso(2048)).toBe("2 kB");
  });

  it("pallino sulla voce Documenti solo con novità", () => {
    const lead = { id: "L1", company: "Rossi", source: "manuale", stageId: "da-richiamare", createdAt: ORA } as unknown as Lead;
    const con = render(<DatiLead lead={lead} utenti={[]} documenti={2} novita={3} onResponsabile={() => {}} onDocumenti={() => {}} onModifica={() => {}} />);
    expect(con).toContain("2 documenti");
    expect(con).toContain("3 novità da vedere");
    const senza = render(<DatiLead lead={lead} utenti={[]} documenti={0} novita={0} onResponsabile={() => {}} onDocumenti={() => {}} onModifica={() => {}} />);
    expect(senza).not.toContain("novità da vedere");
    expect(senza).toContain("nessuno: carica un file");
  });
});
