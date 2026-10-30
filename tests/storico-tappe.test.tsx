import { describe, expect, it } from "vitest";
import { Storico, dataCorta } from "../src/pagine/commerciale/lead/Storico";
import { tappe } from "../src/pagine/commerciale/lead/storicoTappe";
import type { DocumentRow } from "../src/types";
import { render } from "./render";

// Giro 4 (30/10/2026): storico del lead a tappe, una riga per passo con i documenti accanto.
const ORA = Date.UTC(2026, 9, 30, 10);
const G = 86_400_000;
const doc = (id: string, kind: DocumentRow["kind"], extra: Partial<DocumentRow> = {}): DocumentRow =>
  ({ id, leadId: "L1", name: id, url: null, createdAt: ORA - G, file: true, version: 1, kind, callId: null, ...extra });

const lead = { createdAt: ORA - 20 * G, source: "meta", metaCampaign: "Autunno" };
const dati = {
  call: [
    { id: "C1", kind: "conoscenza", scheduledAt: ORA - 10 * G, outcome: "fatta" },
    { id: "C2", kind: "offerta", scheduledAt: ORA - 3 * G, outcome: "fatta" },
    { id: "C3", kind: "progetto", scheduledAt: ORA + 2 * G, outcome: null },
  ],
  proposte: [{ id: "P1", number: "2026-055", status: "presentata", data: ORA - 5 * G }],
  cliente: null,
} as never;
const attivita = [
  { id: "A1", type: "cambio_fase", body: 'Da "Nuovo" a "Call fissata"', createdAt: ORA - 15 * G },
  { id: "A2", type: "nota", body: "Ha chiesto lo sconto", createdAt: ORA - 4 * G },
] as never;
const perCall = new Map([["C1", [doc("R1", "registrazione", { callId: "C1" }), doc("T1", "trascrizione", { callId: "C1" })]]]);
const t = tappe({ lead, attivita, dati, documentiCall: perCall, preventivi: [doc("V1", "preventivo")], nuovi: ["T1"], ora: ORA });

describe("tappe dello storico", () => {
  it("in ordine di data, ultima passata attuale, call futura in fondo", () => {
    expect(t.map((x) => x.chiave)).toEqual(["arrivo", "fase-A1", "call-C1", "proposta-P1", "call-C2", "call-C3"]);
    expect(t.filter((x) => x.attuale).map((x) => x.chiave)).toEqual(["call-C2"]);
    expect(t.at(-1)).toMatchObject({ futura: true, attuale: false });
  });
  it("niente note a mano; testi chiari", () => {
    expect(t.some((x) => x.testo.includes("sconto"))).toBe(false);
    expect(t[0]).toMatchObject({ testo: "Lead arrivato da Meta", dettaglio: "Campagna Autunno" });
    expect(t[1].testo).toBe("Passato a Call fissata");
    expect(t.find((x) => x.chiave === "proposta-P1")?.testo).toBe("Preventivo 2026-055 inviato");
  });
  it("documenti sulla riga giusta: trascrizione e registrazione sulla call, preventivo sulla proposta", () => {
    const c1 = t.find((x) => x.chiave === "call-C1")!;
    expect(c1.documenti.map((d) => [d.testo, d.href, d.nuovo])).toEqual([
      ["Guarda la trascrizione", "/api/documents/T1/file", true],
      ["Ascolta la registrazione", "/api/documents/R1/file", false],
    ]);
    expect(t.find((x) => x.chiave === "proposta-P1")?.documenti.map((d) => d.testo)).toEqual(["Apri il preventivo"]);
    expect(t.find((x) => x.chiave === "call-C2")?.caricaRegistrazione).toBe("C2");
  });
  it("senza proposte il preventivo caricato ha una riga sua", () => {
    const s = tappe({ lead, attivita: [], dati: { call: [], proposte: [], cliente: null } as never, documentiCall: new Map(), preventivi: [doc("V1", "preventivo")], nuovi: [], ora: ORA });
    expect(s.map((x) => x.testo)).toEqual(["Lead arrivato da Meta", "Preventivo caricato"]);
  });
});

describe("tabella dello storico", () => {
  const html = render(<Storico tappe={t} ora={ORA} fase={{ id: "offerta", label: "Offerta" }} onTutte={() => {}} onCaricaRegistrazione={() => {}} />);
  it("intestazioni, riga attuale segnata, blocco In programma dopo le passate", () => {
    for (const s of [">Storico</h2>", "Tutte le attività", ">Data<", ">Cosa è successo<", ">Documenti<", "Adesso"]) expect(html).toContain(s);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html.indexOf('data-tappa="call-C2"')).toBeLessThan(html.indexOf("In programma"));
    expect(html.indexOf("In programma")).toBeLessThan(html.indexOf('data-tappa="call-C3"'));
    expect(html).toContain('href="/api/documents/T1/file"');
    expect(html).toContain("Carica la registrazione");
  });
  it("data corta, anno solo se diverso", () => {
    expect(dataCorta(Date.UTC(2026, 9, 12, 10), ORA)).toBe("12 ott");
    expect(dataCorta(Date.UTC(2025, 11, 3, 10), ORA)).toBe("3 dic 2025");
  });
});
