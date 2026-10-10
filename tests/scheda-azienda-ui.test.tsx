import { describe, expect, it, vi } from "vitest";
import { TestoMarkdown } from "../src/ds";
import { Oggi } from "../src/pagine/commerciale/Oggi";
import { SezioneSchedaAzienda } from "../src/pagine/commerciale/SezioneSchedaAzienda";
import type { Oggi as DatiOggi } from "../src/types";
import { contaPrimari, render } from "./render";

const base = { versione: 1, contenuto: null, fonti: [], modello: null, aggiornata: null, errore: null, motivo: null, jobId: null };
const r = (stato: string, extra = {}, manuale = false) =>
  render(<SezioneSchedaAzienda leadId="L1" manuale={manuale} />, { percorso: "/commerciale/lead/L1", dati: [[["scheda-azienda", "L1"], { ...base, stato, ...extra }]] });

describe("SezioneSchedaAzienda", () => {
  it("privato: motivo e Prepara comunque, nessun primario", async () => {
    const html = await r("privato", { motivo: "nome di persona" });
    expect(html).toContain("Scheda non preparata: sembra un privato");
    expect(html).toContain("nome di persona");
    expect(html).toContain("Prepara comunque");
    expect(contaPrimari(html)).toBe(0);
  });
  it("lead a mano senza scheda: Prepara la scheda", async () => {
    expect(await r("nessuna", {}, true)).toContain("Prepara la scheda");
  });
  it("in coda: nessun pulsante", async () => {
    const html = await r("in_coda");
    expect(html).toContain("In coda");
    expect(html).not.toContain("<button");
  });
  it("errore con lavoro: Riprova la scheda", async () => {
    expect(await r("errore", { errore: "Risposta troncata", jobId: "j1" })).toContain("Riprova la scheda");
  });
  it("pronta: contenuto come testo, Rigenera e versione da stampare", async () => {
    const html = await r("pronta", { contenuto: "## Chi è\n<script>x</script>\n[x](javascript:alert(1))", aggiornata: 0, fonti: [{ url: "javascript:alert(2)", titolo: "cattiva" }, { url: "https://a.it", titolo: "Fonte A" }] });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Fonte A");
    expect(html).not.toContain("cattiva");
    expect(html).toContain("Rigenera la scheda");
    expect(html).toContain("/api/leads/L1/scheda-azienda/stampa");
    expect(contaPrimari(html)).toBe(0);
  });
});

describe("TestoMarkdown", () => {
  it("titoli, elenchi, grassetto e link http come elementi React", () => {
    const html = render(<TestoMarkdown testo={"## Chi è\n- **uno**\n- [due](https://a.it)\n\nfine"} />);
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>uno</strong>");
    expect(html).toContain('href="https://a.it"');
    expect(html).toContain("<p");
  });
});

describe("Oggi: riga della call di conoscenza", () => {
  const ORA = Date.UTC(2026, 9, 13, 8, 0);
  const dati: DatiOggi = {
    adesso: null, nuovi: [], daFare: [], proposte: [], fermi: [], finePausa: [],
    call: [
      { id: "k1", leadId: "a", company: "Officina a", contactName: null, phone: null, kind: "conoscenza", scheduledAt: ORA + 7_200_000, meetLink: null, scheda: "pronta" },
      { id: "k2", leadId: "b", company: "Officina b", contactName: null, phone: null, kind: "conoscenza", scheduledAt: ORA + 9_000_000, meetLink: null, scheda: "in_preparazione" },
      { id: "k3", leadId: "c", company: "Officina c", contactName: null, phone: null, kind: "presentazione", scheduledAt: ORA + 10_000_000, meetLink: null, scheda: "pronta" },
    ],
    numeri: { leadNuovi: 0, primaRispostaMinuti: null, callSettimana: 3, proposteAperte: 0 }, totale: 3,
  };
  it("pronta o in preparazione, solo per la conoscenza", () => {
    const html = render(<Oggi ora={ORA} />, { percorso: "/commerciale/oggi", dati: [[["today", "mie"], dati]] });
    expect(html.match(/Scheda azienda pronta/g)?.length).toBe(1);
    expect(html).toContain("Scheda in preparazione");
  });
});

describe("SezioneSchedaAzienda: errori e versione precedente", () => {
  it("Prepara, Rigenera e Riprova che falliscono mostrano il toast con l'errore", async () => {
    const { toast } = await import("sonner");
    const { QueryClient } = await import("@tanstack/react-query");
    const { azioniScheda } = await import("../src/pagine/commerciale/SezioneSchedaAzienda");
    const spia = vi.spyOn(toast, "error").mockImplementation(() => "t");
    const a = azioniScheda(new QueryClient(), "L1");
    a.prepara.onError(new Error("Lead non trovato"));
    a.riprova.onError(new Error("Lavoro non trovato"));
    expect(spia.mock.calls.map((c) => c[0])).toEqual(["Lead non trovato", "Lavoro non trovato"]);
    spia.mockRestore();
  });
  it("nuova versione in preparazione: la precedente resta visibile e stampabile", async () => {
    const html = await r("in_coda", { contenuto: "## Chi è\nvecchia", versione: 1, aggiornata: 0 });
    expect(html).toContain("Nuova versione in preparazione");
    expect(html).toContain("vecchia");
    expect(html).toContain("/api/leads/L1/scheda-azienda/stampa");
    expect(html).not.toContain("Rigenera la scheda");
  });
  it("nuova versione non riuscita: Riprova e la precedente resta", async () => {
    const html = await r("errore", { contenuto: "## Chi è\nvecchia", versione: 1, aggiornata: 0, errore: "Risposta troncata", jobId: "j2" });
    expect(html).toContain("Nuova versione non riuscita");
    expect(html).toContain("Riprova la scheda");
    expect(html).toContain("vecchia");
    expect(contaPrimari(html)).toBe(0);
  });
});
