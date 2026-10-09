import { afterEach, describe, expect, it } from "vitest";
import { InCostruzione } from "../src/pagine/automazioni/InCostruzione";
import { Pannello } from "../src/pagine/automazioni/Pannello";
import { SchedaAutomazione } from "../src/pagine/automazioni/Scheda";
import { setAnonimo } from "../src/pagine/automazioni/anonimo";
import { Clienti } from "../src/pagine/commerciale/Clienti";
import { Canoni } from "../src/pagine/economia/Canoni";
import { Cruscotto } from "../src/pagine/economia/Cruscotto";
import { Fatture } from "../src/pagine/economia/Fatture";
import type { AutomazioneRiga, CanoneRiga, ClienteRiga, Cruscotto as DatiCruscotto, FatturaRiga } from "../src/types";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 10, 20, 9, 0); // venerdì 20 novembre 2026
const G = 86_400_000;
const fattura = (x: Partial<FatturaRiga>): FatturaRiga => ({
  id: "i1", clientId: "c1", cliente: "Officina Prova", kind: "canone", number: "7/2026", amountCents: 30000, period: null,
  issuedAt: ORA - 20 * G, dueAt: Date.UTC(2026, 10, 15, 11, 0), paidAt: null, pdfUrl: null, note: null, stato: "in_ritardo", ...x,
});
const cruscotto = (x: Partial<DatiCruscotto> = {}): DatiCruscotto => ({
  ricorrenteCents: 30000, obiettivoCents: 200000, inRitardo: [fattura({})], setupMeseCents: 150000, setupAnnoCents: 250000, daIncassareCents: 30000, costiMeseCents: 4500, ...x,
});
const automazione = (x: Partial<AutomazioneRiga>): AutomazioneRiga => ({
  id: "a1", clientId: "c1", proposalId: null, name: "Ordini da WhatsApp", family: "documenti", description: null, status: "attiva", runsOn: "Cloudflare",
  stack: null, monthlyCostCents: 2000, techOwnerId: "diego", pmOwnerId: null, promisedAt: null, activatedAt: ORA, notes: null, createdAt: ORA, updatedAt: ORA,
  cliente: "Officina Prova", settore: "un'officina meccanica", citta: "Pisa", scope: "acceleriamo", proposta: null, ...x,
});

afterEach(() => setAnonimo(false));

describe("Economia", () => {
  it("Cruscotto: ricorrente in testata, barra contro l'obiettivo, un solo primario sulla fattura in ritardo", () => {
    const html = render(<Cruscotto ora={ORA} />, { dati: [[["economia", "cruscotto"], cruscotto()]] });
    expect(html).toMatch(/Economia(<!-- -->)?, <strong[^>]*>€ 300<\/strong>/);
    expect(html).toContain("€ 300 di € 2.000");
    expect(html).toContain('aria-valuenow="15"');
    expect(html).toContain("Nel mese: € 1.500");
    expect(html).toContain("Scaduta il 15 nov");
    expect(html).toContain("Segna incassata");
    expect(contaPrimari(html)).toBe(1);
  });

  it("Cruscotto senza ritardi: niente striscia, nessun primario", () => {
    const html = render(<Cruscotto ora={ORA} />, { dati: [[["economia", "cruscotto"], cruscotto({ inRitardo: [] })]] });
    expect(html).not.toContain("Da fare");
    expect(contaPrimari(html)).toBe(0);
  });

  it("Fatture: gruppi nell'ordine della spec, scadenza breve, tipo come etichetta", () => {
    const fatture = [
      fattura({}),
      fattura({ id: "i2", stato: "emessa", dueAt: Date.UTC(2026, 11, 5, 11, 0), kind: "saldo" }),
      fattura({ id: "i4", stato: "da_emettere", issuedAt: null, dueAt: null, kind: "extra" }),
      fattura({ id: "i5", stato: "incassata", paidAt: Date.UTC(2026, 9, 10, 11, 0) }),
    ];
    const html = render(<Fatture ora={ORA} />, { dati: [[["economia", "fatture"], fatture]] });
    const pos = ["In ritardo", "Emesse", "Da emettere", "Incassate"].map((t) => html.indexOf(`>${t}<`));
    expect(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(html).toContain("scaduta 15 nov");
    expect(html).toContain("scade 5 dic");
    expect(html).toContain("ottobre 2026: € 300");
    expect(html).toContain(">Saldo<");
    expect(contaPrimari(html)).toBe(1);
  });

  it("Canoni: totale attivo in testata, stato per riga, cessati a scomparsa, nessun primario", () => {
    const base = { clientId: "c1", automationId: null, billingDay: 1, startAt: ORA, pausedAt: null, endAt: null, note: null };
    const canoni: CanoneRiga[] = [
      { ...base, id: "f1", cliente: "Officina Prova", amountCents: 30000, status: "attivo" },
      { ...base, id: "f2", cliente: "Agenzia Prova", amountCents: 15000, status: "in_pausa" },
      { ...base, id: "f3", cliente: "Bar Prova", amountCents: 10000, status: "cessato" },
    ];
    const html = render(<Canoni />, { dati: [[["economia", "canoni"], canoni]] });
    expect(html).toMatch(/Canoni(<!-- -->)?, <strong[^>]*>€ 300<\/strong>/);
    expect(html).toContain("in pausa");
    expect(html).toContain("Fatturazione il giorno 1");
    expect(html).toMatch(/<details[^>]*>.*Cessati, 1/s);
    expect(contaPrimari(html)).toBe(0);
  });
});

describe("Automazioni", () => {
  const pannello = {
    automazioni: [
      automazione({}),
      automazione({ id: "a2", name: "Agenda dello studio", cliente: "Studio Prova", settore: "uno studio dentistico", citta: "Lucca", scope: "fuori_perimetro" }),
      automazione({ id: "a3", name: "Solleciti", status: "in_costruzione", promisedAt: Date.UTC(2026, 11, 1, 11, 0) }),
    ],
    totali: { attive: 2, inCostruzione: 1, costiViviCents: 4000 },
  };

  it("Pannello: card con un fatto per riga, etichetta fuori perimetro, interruttore, nessun primario", () => {
    const html = render(<Pannello />, { dati: [[["automazioni"], pannello]] });
    expect(html).toMatch(/Automazioni(<!-- -->)?, <strong[^>]*>2<\/strong>/);
    expect(html).toContain("Studio Prova");
    expect(html).toContain("Fuori perimetro");
    expect(html).toContain("Leggere e riscrivere documenti");
    expect(html).toContain("€ 40 di costi vivi al mese");
    expect(html).toContain('role="switch"');
    expect(contaPrimari(html)).toBe(0);
  });

  it("Pannello anonimo: settore e città al posto del nome, niente fuori perimetro", () => {
    setAnonimo(true);
    const html = render(<Pannello />, { dati: [[["automazioni"], pannello]] });
    expect(html).toContain("Un&#x27;officina meccanica di Pisa");
    expect(html).toContain("Uno studio dentistico di Lucca");
    expect(html).not.toContain("Officina Prova");
    expect(html).not.toContain("Studio Prova");
    expect(html).not.toContain("Fuori perimetro");
  });

  it("In costruzione: promessa più vicina per prima, responsabile tecnico, interruttore spento di default", () => {
    const dati: [unknown[], unknown][] = [
      [["automazioni"], { ...pannello, automazioni: [...pannello.automazioni, automazione({ id: "a4", name: "Riepilogo", status: "in_costruzione", promisedAt: Date.UTC(2026, 10, 25, 11, 0), techOwnerId: null })] }],
      [["users"], [{ id: "diego", name: "Diego" }]],
    ];
    const html = render(<InCostruzione ora={ORA} />, { dati });
    expect(html).toMatch(/In costruzione(<!-- -->)?, <strong[^>]*>2<\/strong>/);
    expect(html.indexOf("Riepilogo")).toBeLessThan(html.indexOf("Solleciti"));
    expect(html).toContain("Promessa per il 25 nov");
    expect(html).toContain("Responsabile tecnico: Diego");
    expect(html).toContain("Responsabile tecnico: da scegliere");
    expect(contaPrimari(html)).toBe(0);
    expect(render(<Pannello ora={ORA} />, { dati })).toContain('aria-checked="false"');
  });

  it("Scheda in costruzione: Segna attiva è l'unico primario; attiva: nessuno", () => {
    const utenti = [{ id: "diego", name: "Diego" }];
    const inCostruzione = render(<SchedaAutomazione id="a1" />, { dati: [[["automazioni", "a1"], automazione({ status: "in_costruzione" })], [["users"], utenti]] });
    expect(inCostruzione).toContain("Segna attiva");
    expect(inCostruzione).toContain('data-selettore="Responsabile tecnico"');
    expect(contaPrimari(inCostruzione)).toBe(1);
    const attiva = render(<SchedaAutomazione id="a1" />, { dati: [[["automazioni", "a1"], automazione({})], [["users"], utenti]] });
    expect(contaPrimari(attiva)).toBe(0);
  });
});

describe("Clienti", () => {
  it("una riga per cliente: canone, stato, fuori perimetro; cessati a scomparsa; nessun primario", () => {
    const base = { sector: null, originLeadId: null };
    const clienti: ClienteRiga[] = [
      { ...base, id: "c1", name: "Officina Prova", city: "Pisa", scope: "acceleriamo", canoneCents: 30000, stato: "attivo" },
      { ...base, id: "c2", name: "Studio Prova", city: "Lucca", scope: "fuori_perimetro", canoneCents: 0, stato: "in_costruzione" },
      { ...base, id: "c3", name: "Bar Prova", city: null, scope: "acceleriamo", canoneCents: 0, stato: "cessato" },
    ];
    const html = render(<Clienti />, { dati: [[["clienti"], clienti]] });
    expect(html).toMatch(/Clienti(<!-- -->)?, <strong[^>]*>3<\/strong>/);
    expect(html).toContain("€ 300 al mese");
    expect(html).toContain("Nessun canone");
    expect(html).toContain("Fuori perimetro");
    expect(html).toMatch(/<details[^>]*>.*Cessati, 1/s);
    expect(contaPrimari(html)).toBe(0);
  });

  it("cliente con il canone in pausa: nel gruppo A canone, col tag in pausa, prima di In costruzione", () => {
    const base = { sector: null, originLeadId: null, city: null, scope: "acceleriamo" as const };
    const clienti: ClienteRiga[] = [
      { ...base, id: "c4", name: "Studio Fermo", canoneCents: 0, stato: "in_pausa" },
      { ...base, id: "c5", name: "Vivaio Nuovo", canoneCents: 0, stato: "in_costruzione" },
      { ...base, id: "c1", name: "Officina Prova", canoneCents: 30000, stato: "attivo" },
    ];
    const html = render(<Clienti />, { dati: [[["clienti"], clienti]] });
    const pos = [">A canone<", "Officina Prova", "Studio Fermo", ">In costruzione<", "Vivaio Nuovo"].map((t) => html.indexOf(t));
    expect(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(html).toContain(">in pausa<");
    expect(html).not.toContain("Cessati");
  });
});
