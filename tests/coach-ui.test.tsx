import { describe, expect, it, vi } from "vitest";
import { CoachCall } from "../src/pagine/commerciale/CoachCall";
import { applicaProposta, statoIniziale } from "../src/pagine/commerciale/esito";
import { contaPrimari, render } from "./render";

const lead = { id: "L1", company: "Officina Prova", contactName: null, stageId: "appuntamento-confermato", attemptCount: 0 };
const opzioni = (coach: unknown) => ({ percorso: "/commerciale/lead/L1", dati: [[["coach", "C1"], coach], [["stages"], []]] as [unknown[], unknown][] });

describe("CoachCall", () => {
  it("prima della richiesta: solo il secondario Chiedi al coach", async () => {
    const html = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, opzioni({ id: null, stato: "nessuno", risultato: null, errore: null, jobId: null }));
    expect(html).toContain("Chiedi al coach");
    expect(contaPrimari(html)).toBe(0);
  });

  it("pronto: una riga per aprire i suggerimenti, nessun primario fuori dal foglio", async () => {
    const r = { riassunto: "x", faseSuggerita: null, prossimaAzione: { testo: "Fissare la call", entroGiorni: 2 }, prossimaAzioneAt: 0, bozzaFollowUp: "", risposteObiezioni: [], controlli: [] };
    const html = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, opzioni({ id: "A1", stato: "pronto", risultato: r, errore: null, jobId: "J" }));
    expect(html).toContain("Leggi i suggerimenti del coach");
    expect(html).not.toContain("Applica i suggerimenti");
    expect(html).not.toContain("Chiedi al coach");
    expect(contaPrimari(html)).toBe(0);
  });

  it("in coda, fermo per il tetto, errore: una riga di stato; dopo un errore si chiede di nuovo", async () => {
    const coda = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, opzioni({ id: "A1", stato: "in_coda", risultato: null, errore: null, jobId: "J" }));
    expect(coda).toContain("Il coach legge le note");
    expect(coda).not.toContain("Chiedi al coach");
    const tetto = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, opzioni({ id: "A1", stato: "fermo_tetto", risultato: null, errore: null, jobId: "J" }));
    expect(tetto).toContain("tetto di spesa del mese");
    const errore = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, opzioni({ id: "A1", stato: "errore", risultato: null, errore: "Suggerimenti fuori formato", jobId: "J" }));
    expect(errore).toContain("Suggerimenti fuori formato");
    expect(errore).toContain("Chiedi di nuovo al coach");
    expect(contaPrimari(errore)).toBe(0);
  });

  it("in caricamento: segnaposto, nessun pulsante", async () => {
    const html = render(<CoachCall callId="C1" leadId="L1" lead={lead} />, { dati: [[["stages"], []]] });
    expect(html).not.toContain("Chiedi al coach");
    expect(contaPrimari(html)).toBe(0);
  });

  it("Chiedi e Applica che falliscono mostrano il toast con l'errore", async () => {
    const { toast } = await import("sonner");
    const { QueryClient } = await import("@tanstack/react-query");
    const { azioniCoach } = await import("../src/pagine/commerciale/CoachCall");
    const spia = vi.spyOn(toast, "error").mockImplementation(() => "t");
    const a = azioniCoach(new QueryClient(), "C1", () => {});
    a.chiedi.onError(new Error("Il coach legge solo le call fatte"));
    a.applica.onError(new Error("Suggerimenti non pronti"));
    expect(spia).toHaveBeenNthCalledWith(1, "Il coach legge solo le call fatte");
    expect(spia).toHaveBeenNthCalledWith(2, "Suggerimenti non pronti");
    spia.mockRestore();
  });
});

describe("statoIniziale con i suggerimenti del coach", () => {
  it("fase, prossima azione e note arrivano precompilate, l'esito resta da scegliere", () => {
    const s = statoIniziale("r", { stageId: "appuntamento-confermato" }, { stageId: "presentazione-confermata", nextAction: "Fissare la call", nextActionAt: 5, note: "Dal coach: x" });
    expect(s).toMatchObject({ esito: null, stageId: "presentazione-confermata", nextAction: "Fissare la call", nextActionAt: 5, note: "Dal coach: x" });
  });
  it("senza fase suggerita resta quella del lead", () => {
    expect(statoIniziale("r", { stageId: "appuntamento-confermato" }, { nextAction: "x" }).stageId).toBe("appuntamento-confermato");
  });
});

describe("applicaProposta: chi vince tra coach e regole", () => {
  const iniziale = { stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: 5, note: "Dal coach: x" };
  const regole = { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: 9 };
  it("esito qualsiasi: restano fase e prossima azione del coach", () => {
    const s = applicaProposta({ ...statoIniziale("r", { stageId: "appuntamento-confermato" }, iniziale), esito: "risposto" }, regole, iniziale);
    expect(s).toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: 5 });
  });
  it("conoscenza fissata, non interessato, fuori target: vincono le regole", () => {
    for (const esito of ["conoscenza_fissata", "non_interessato", "fuori_target"] as const) {
      const s = applicaProposta({ ...statoIniziale("r", { stageId: "appuntamento-confermato" }, iniziale), esito }, { ...regole, lostReason: "motivo" }, iniziale);
      expect(s).toMatchObject({ stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: 9, lostReason: "motivo" });
    }
  });
  it("tornando a un altro esito dopo le regole, il coach torna", () => {
    const base = { ...statoIniziale("r", { stageId: "appuntamento-confermato" }, iniziale), stageId: "non-chiuso", nextAction: "", nextActionAt: null, lostReason: "x", esito: "occupato" as const };
    expect(applicaProposta(base, { stageId: null, nextAction: null, nextActionAt: null }, iniziale)).toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: 5, lostReason: null });
  });
  it("senza coach: come prima, decidono le regole", () => {
    const s = applicaProposta({ ...statoIniziale("r", { stageId: "appuntamento-confermato" }), esito: "risposto" }, regole);
    expect(s).toMatchObject({ stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: 9 });
  });
});
