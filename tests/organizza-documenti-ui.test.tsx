import { describe, expect, it } from "vitest";
import { Collegamenti } from "../src/pagine/commerciale/lead/Collegamenti";
import { smista } from "../src/pagine/commerciale/lead/documentiScheda";
import { Preventivo } from "../src/pagine/commerciale/lead/Preventivo";
import type { Collegamenti as Dati, DocumentRow } from "../src/types";
import { contaPrimari, render } from "./render";

// Organizzazione dei documenti nella scheda (30/10/2026): registrazioni accanto alle call, preventivo in evidenza,
// il resto nel foglio Documenti, ogni documento in un posto solo.
const ORA = Date.UTC(2026, 9, 30, 10);
const doc = (id: string, kind: DocumentRow["kind"], extra: Partial<DocumentRow> = {}): DocumentRow =>
  ({ id, leadId: "L1", name: id, url: null, createdAt: ORA - 86_400_000, file: true, version: 1, kind, callId: null, authorName: "Tommaso", ...extra });

const reg = doc("R1", "registrazione", { callId: "C1", name: "Registrazione consulenza 28/10" });
const tra = doc("T1", "trascrizione", { callId: "C1", name: "Trascrizione consulenza 28/10" });
const orfana = doc("R2", "registrazione", { callId: "C-tolta" });
const prev = doc("P1", "preventivo", { name: "Preventivo Prizzi.pdf", version: 2, updatedAt: Date.UTC(2026, 9, 29, 9) });
const foglio = doc("X1", "altro", { name: "conti.xlsx" });

describe("documenti al loro posto", () => {
  it("smista: call, preventivo, foglio; una call che non c'è più rimanda in Documenti", () => {
    const s = smista([reg, tra, orfana, prev, foglio], ["C1", "C2"]);
    expect(s.perCall.get("C1")?.map((d) => d.id)).toEqual(["R1", "T1"]);
    expect(s.preventivi.map((d) => d.id)).toEqual(["P1"]);
    expect(s.altri.map((d) => d.id)).toEqual(["R2", "X1"]);
  });

  it("call: scarica registrazione, leggi trascrizione, Nuovo; call fatta senza registrazione invita a caricarla", () => {
    const dati = {
      proposte: [], cliente: null, automazioni: [], canoni: [],
      call: [
        { id: "C1", kind: "conoscenza", scheduledAt: Date.UTC(2026, 9, 28, 9), outcome: "fatta" },
        { id: "C2", kind: "offerta", scheduledAt: Date.UTC(2026, 9, 29, 9), outcome: "fatta" },
        { id: "C3", kind: "analisi", scheduledAt: Date.UTC(2026, 10, 5, 9), outcome: null },
      ],
    } as unknown as Dati;
    const html = render(<Collegamenti dati={dati} ora={ORA} onCrea={() => {}} documentiCall={new Map([["C1", [reg, tra]]])} nuovi={["T1"]} onCaricaRegistrazione={() => {}} />);
    expect(html).toContain('href="/api/documents/R1/file?scarica=1"');
    expect(html).toContain("Scarica registrazione");
    expect(html).toContain('href="/api/documents/T1/file"');
    expect(html).toContain("Leggi trascrizione");
    expect(html.match(/Nuovo/g)).toHaveLength(1);
    expect(html.match(/Carica registrazione/g)).toHaveLength(1); // solo C2: fatta e senza registrazione
    expect(html).not.toContain('data-documenti-call="C3"');
    // Niente link dentro link.
    expect(html).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*<a /s);
  });

  it("preventivo: nome, versione e data, Apri come azione del blocco (non primaria), versioni a scomparsa", () => {
    const html = render(<Preventivo preventivi={[prev]} proposta={{ id: "PR1", number: "P-2026-007", status: "presentata" }} nuovi={["P1"]} ora={ORA} inCorso={false} onCarica={() => {}} onNuovaVersione={() => {}} />);
    expect(html).toContain("Preventivo Prizzi.pdf");
    expect(html).toContain("Versione 2, 29 ottobre, Tommaso");
    expect(html).toContain('href="/api/documents/P1/file"');
    expect(html).toContain("Apri preventivo");
    expect(html).toContain("Scarica");
    expect(html).toContain("Versioni precedenti (1)");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Proposta P-2026-007, presentata");
    expect(html).toContain("Carica nuova versione");
    expect(html).toContain("Nuovo");
    expect(contaPrimari(html)).toBe(0);
    expect(html).not.toMatch(/[—–]|claude/i);
  });

  it("preventivo: senza file e senza proposta sparisce; con la proposta invita a caricarlo", () => {
    expect(render(<Preventivo preventivi={[]} proposta={null} ora={ORA} inCorso={false} onCarica={() => {}} onNuovaVersione={() => {}} />)).toBe("");
    const html = render(<Preventivo preventivi={[]} proposta={{ id: "PR1", number: "P-2026-007", status: "registrata" }} ora={ORA} inCorso={false} onCarica={() => {}} onNuovaVersione={() => {}} />);
    expect(html).toContain("Nessun file per P-2026-007");
    expect(html).toContain("Carica il preventivo");
  });
});

describe("documenti delle cose da fare", async () => {
  const { NextActionCard } = await import("../src/pagine/commerciale/lead/NextActionCard");
  it("smista: sulla task finché è aperta, poi in Documenti; mai in due posti", () => {
    const lis = doc("D1", "altro", { taskId: "T-aperta", name: "listino.pdf" });
    const vecchio = doc("D2", "preventivo", { taskId: "T-fatta", name: "preventivo vecchio.pdf" });
    const s = smista([lis, vecchio, foglio], [], ["T-aperta"]);
    expect(s.perTask.get("T-aperta")?.map((d) => d.id)).toEqual(["D1"]);
    expect(s.altri.map((d) => d.id)).toEqual(["X1"]);
    expect(s.preventivi.map((d) => d.id)).toEqual(["D2"]);
    expect(smista([lis], [], []).altri.map((d) => d.id)).toEqual(["D1"]);
  });
  it("riga della task: graffetta che apre il file, pallino se nuovo; caricamento dentro la task aperta", () => {
    const lead = { id: "L1", company: "Prova", stageId: "da-richiamare", stageChangedAt: ORA, prossima: null, nextAction: null, phone: null, meetLink: null } as never;
    const task = [{ id: "T1", title: "Mandare il listino", dueAt: ORA + 3_600_000, doneAt: null, note: null }];
    const html = render(<NextActionCard lead={lead} ora={ORA} onComando={() => undefined} onCaricaTask={() => undefined} nuovi={["D1"]}
      documentiTask={new Map([["T1", [doc("D1", "altro", { taskId: "T1", name: "listino.pdf" })]]])} />, { dati: [[["lead", "L1", "task"], { task }], [["lead", "L1", "calls"], []]] });
    expect(html).toContain('aria-label="Apri il documento listino.pdf, nuovo"');
    expect(html).toContain('href="/api/documents/D1/file"');
  });
});
