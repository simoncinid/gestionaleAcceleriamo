import { describe, expect, it } from "vitest";
import { CasellaInvito, TESTO_IN_CODA } from "../src/pagine/commerciale/CasellaInvito";
import { FoglioChiusura } from "../src/pagine/commerciale/FoglioChiusura";
import { FoglioFissaCall } from "../src/pagine/commerciale/FoglioFissaCall";
import { CampoGiorno, Contatto } from "../src/ds";
import { presetInizio } from "../src/format";
import type { Stage } from "../src/types";
import { contaPrimari, render } from "./render";

const CHIUSO: Stage = { id: "chiuso", label: "Chiuso", sortOrder: 90, kind: "won", tone: "neutro", probability: 100, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: false } as Stage;
const LEAD = { id: "abc", stageId: "da-richiamare", company: "Ferri Srl", setupCents: 100_000, feeCents: 10_000 };

describe("Q5: invito senza Resend", () => {
  it("la casella dice che l'invito va in coda, senza checkbox nativo", () => {
    expect(render(<CasellaInvito attiva onCambia={() => {}} />)).not.toContain('type="checkbox"');
    expect(render(<CasellaInvito attiva onCambia={() => {}} senzaEmail />)).toContain("Manca l&#x27;email del referente");
    const html = render(<CasellaInvito attiva onCambia={() => {}} inCoda />);
    expect(html).toContain(TESTO_IN_CODA);
    expect(render(<CasellaInvito attiva onCambia={() => {}} />)).not.toContain(TESTO_IN_CODA);
  });
  it("il pulsante promette l'invito solo con Resend collegato", () => {
    const senza = render(<FoglioFissaCall leadId="abc" haEmail onChiudi={() => {}} />, { dati: [[["integrazioni"], { segreti: { resend: false } }]] });
    expect(senza).not.toContain("Fissa call e manda l&#x27;invito");
    const con = render(<FoglioFissaCall leadId="abc" haEmail onChiudi={() => {}} />, { dati: [[["integrazioni"], { segreti: { resend: true } }]] });
    expect(con).toContain("Fissa call e manda l&#x27;invito");
  });
});

describe("Q6 e Q7: foglio di Chiuso", () => {
  it("precompilato con i soldi del lead e il nome, un solo primario", () => {
    const html = render(<FoglioChiusura lead={LEAD} fase={CHIUSO} onChiudi={() => {}} />, { dati: [[["lead", "abc", "proposte"], [{ status: "accettata", option: "standard", setupCents: 250_000, feeCents: 30_000 }]]] });
    expect(html).toContain('value="Ferri Srl"');
    expect(html).toContain('value="2.500"');
    expect(html).toContain('value="300"');
    expect(html).toContain("Chiudi e crea il cliente");
    expect(contaPrimari(html)).toBe(1);
  });
  it("la data di inizio è un Selettore con le scelte rapide, niente select nativo", () => {
    const html = render(<CampoGiorno etichetta="Data di inizio" valore={null} onCambia={() => {}} ora={Date.UTC(2026, 9, 13, 8, 0)} />);
    expect(html).toContain('data-selettore="Data di inizio"');
    expect(html).not.toContain("<select");
    expect(presetInizio(Date.UTC(2026, 9, 13, 8, 0)).map((p) => p.etichetta)).toEqual(["Oggi", "Lunedì prossimo", "Primo del mese prossimo"]);
  });
});

describe("Q4: pulsanti di contatto nelle righe strette", () => {
  it("senzaNome dice solo Chiama; intero non tronca il testo", () => {
    const lead = { id: "abc", phone: "+393330000001", email: null, contactName: "Mario Bianchi", company: "Ferri Srl" };
    const corto = render(<Contatto tipo="chiama" lead={lead} senzaNome />);
    expect(corto).toContain(">Chiama<");
    expect(corto).not.toContain("Mario");
    const intero = render(<Contatto tipo="chiama" lead={lead} intero />);
    expect(intero).not.toContain("truncate");
    expect(intero).toContain("shrink-0");
  });
});
