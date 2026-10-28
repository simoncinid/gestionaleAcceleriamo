import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api";
import { CampoGiorno, CampoQuando, CardLead, Errore, PRIMO_CAMPO, Tag } from "../src/ds";
import { presetPassato } from "../src/format";
import { FoglioFattura } from "../src/pagine/economia/Fogli";
import { scorciatoiaRicerca } from "../src/guscio/scorciatoie";
import { eBloccoDemo, eCallNelPassato, messaggioImportInterrotto, testoBloccoDemo } from "../src/errori";
import { CorpoEsporta } from "../src/pagine/impostazioni/Dati";
import { Fasi } from "../src/pagine/impostazioni/Fasi";
import { IntegrazioneDettaglio } from "../src/pagine/impostazioni/IntegrazioneDettaglio";
import { Utenti } from "../src/pagine/impostazioni/Utenti";
import { FoglioAbbina } from "../src/pagine/commerciale/FoglioProposta";
import { Voci } from "../src/pagine/commerciale/MenuRapido";
import type { LeadListItem, Stage } from "../src/types";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { contaPrimari, render } from "./render";

const f = (id: string, kind: Stage["kind"], sortOrder: number): Stage => ({ id, label: id.toUpperCase(), sortOrder, kind, tone: "neutral", requiresReason: false, probability: 10, suggestedNextAction: null, suggestedDelayHours: null });
const FASI = [f("a", "open", 10), f("b", "open", 20), f("c", "open", 30), f("vinto", "won", 40), f("perso", "lost", 50)];

describe("Riordina", () => {
  it("pagina Fasi: niente Riordina, le fasi sono fisse (blocco 1, modifica 4)", () => {
    const html = render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], FASI], [["stage-rules"], []], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], []]] });
    expect(html).not.toContain(">Riordina<");
    expect(html).not.toContain("arriva nel Piano B");
    expect(contaPrimari(html)).toBe(1);
  });
});

describe("Fasi senza checkbox nativi", () => {
  it("regola attiva e giorni di lavoro con il DS", () => {
    const regole = [{ id: "r1", ruleKey: "sla", stageId: null, event: "lead_creato", params: { minuti: 120, avvisoMinuti: 90 }, active: true }];
    const html = render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], FASI], [["stage-rules"], regole], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], []]] });
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Giorni di lavoro");
    expect(html).toContain("lun, mar, mer, gio, ven");
  });
});

describe("Card della Scaletta", () => {
  it("mostra chi segue il lead", () => {
    const html = render(<CardLead lead={{ id: "L1", company: "Officina", stageLabel: "Da richiamare", stageChangedAt: 0 }} assegnato="Diego Simoncini" />, { percorso: "/commerciale/scaletta" });
    expect(html).toContain("Segue Diego Simoncini");
  });
});

describe("Errore", () => {
  it("il codice compare una volta sola", () => {
    const e = new ApiError(500, "Errore del server (codice ab12cd34)", { error: "Errore del server", errorId: "ab12cd34" });
    const html = render(<Errore errore={e} onRiprova={() => {}} />, { percorso: "/" });
    expect(html.match(/ab12cd34/g)).toHaveLength(1);
  });
});

describe("Impostazioni: voci 46, 59, 60, 63, 64 e toast demo", () => {
  const ORA = Date.UTC(2026, 9, 12, 9);
  const stato = {
    integrazioni: [{ key: "foglio", etichetta: "Foglio di Andrea", stato: "spento", ultimaOk: null, nota: null }, { key: "resend", etichetta: "Resend", stato: "spento", ultimaOk: null, nota: null }, { key: "telegram", etichetta: "Telegram", stato: "ok", ultimaOk: ORA, nota: null }],
    settimana: { meta: 0, foglio: 0, aggancio: 0 }, errori: [], segreti: { meta: false, resend: false, google: false, aggancio: false }, foglio: { ultimaRiga: 1, ultimaLettura: null },
  };
  const dettaglio = (k: string, extra: [unknown[], unknown][] = []) => render(<IntegrazioneDettaglio ora={ORA} />, { percorso: `/impostazioni/integrazioni/${k}`, rotta: "/impostazioni/integrazioni/:key", dati: [[["integrazioni"], stato], [["settings"], IMPOSTAZIONI_DEFAULT], ...extra] });
  it("46: senza letture non c'è \"Ultima riga letta\"", () => {
    const html = dettaglio("foglio");
    expect(html).not.toContain("Ultima riga letta");
    expect(html).toContain("Il foglio non è ancora stato letto");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('role="switch"');
  });
  it("Resend: interruttore al posto della casella", () => {
    const html = dettaglio("resend");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Email di conferma ai lead nuovi");
  });
  it("64: scollega è secondario finché non si tocca di nuovo", () => {
    const profilo = { id: "tommaso", name: "Tommaso", email: "t@esempio.it", telegram: true, avvisi: {}, quiete: null };
    const html = dettaglio("telegram", [[["me", "profilo"], profilo]]);
    expect(html).toMatch(/data-variante="secondario"[^>]*>(<[^>]+>)*Scollega la tua chat/);
    expect(html).not.toContain('data-variante="distruttivo"');
  });
  it("63: se l'elenco degli utenti non arriva c'è l'errore con Riprova", () => {
    const html = render(<Utenti />, { percorso: "/impostazioni/utenti", errori: [[["users"], new ApiError(500, "Errore del server (codice ab12cd34)")]] });
    expect(html).toContain("Riprova");
  });
  it("60: nel foglio Esporta una riga spiega l'apostrofo davanti a +39", () => {
    expect(render(<CorpoEsporta />)).toContain("Davanti ai telefoni come +39 trovi un apostrofo");
  });
  it("59: l'import interrotto dice fino a quale riga del file", () => {
    expect(messaggioImportInterrotto("Errore del server", [2, 3, 5, 8], 2)).toBe("Errore del server. Entrate le righe fino alla 3 del file; dalla riga 5 in poi no");
    expect(messaggioImportInterrotto("Errore del server", [2, 3], 0)).toBe("Errore del server. Nessuna riga importata: riprova");
  });
  it("toast demo: il 409 dello spazio demo è un blocco spiegato, non un errore", () => {
    const e = new ApiError(409, "Spazio demo: password e nome dell'utente non si cambiano");
    expect(eBloccoDemo(e)).toBe(true);
    expect(testoBloccoDemo(e).titolo).toBe("Password e nome dell'utente non si cambiano");
    expect(eBloccoDemo(new ApiError(409, "Questo lead ha già un cliente"))).toBe(false);
    expect(eBloccoDemo(new ApiError(409, "Nello spazio demo il foglio non si legge"))).toBe(true);
  });
});

describe("Guscio e Foglio: voci 43 e 65", () => {
  it("Cmd K non apre la ricerca sopra un altro foglio", () => {
    expect(scorciatoiaRicerca({ metaKey: true, ctrlKey: false, key: "k" }, false)).toBe("si");
    expect(scorciatoiaRicerca({ metaKey: false, ctrlKey: true, key: "K" }, true)).toBe("ignora");
    expect(scorciatoiaRicerca({ metaKey: false, ctrlKey: false, key: "k" }, false)).toBe("no");
  });
  it("il primo campo comprende campi, interruttori e selettori, non Annulla", () => {
    expect(PRIMO_CAMPO).toContain("input");
    expect(PRIMO_CAMPO).toContain("[role=switch]");
    expect(PRIMO_CAMPO).toContain("button[aria-expanded]");
  });
});

describe("Commerciale: voci 34 e 42", () => {
  it("42: le voci del menu rapido sono tutte allineate a sinistra", () => {
    const lead = { id: "L1", company: "Officina", phone: "+393330000001", email: null, stageId: "a", contactName: null } as unknown as LeadListItem;
    const html = render(<Voci lead={lead} chiudi={() => {}} onEsito={() => {}} onSposta={() => {}} />, { percorso: "/commerciale/scaletta" });
    const voci = html.match(/<(a|button)[^>]*class="[^"]*"/g) ?? [];
    expect(voci.length).toBe(4);
    for (const v of voci) expect(v).toContain("justify-start");
  });
});

describe("Abbina: voce 44", () => {
  it("scegliere il lead non abbina: il primario è spento finché non c'è il lead", () => {
    const proposta = { id: "P1", number: "2026-014", leadId: null, company: "" } as unknown as Parameters<typeof FoglioAbbina>[0]["proposta"];
    const html = render(<FoglioAbbina proposta={proposta} onChiudi={() => {}} />, { percorso: "/commerciale/proposte" });
    expect(contaPrimari(html)).toBe(1);
    expect(html).toMatch(/data-variante="primario"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-variante="primario"/);
  });
});

describe("Date: voci 33, 48 e minore 3", () => {
  const ORA = Date.UTC(2026, 9, 13, 8, 0);
  it("33: CampoGiorno mostra l'etichetta della scorciatoia scelta", () => {
    const [oggi] = presetPassato(ORA);
    const html = render(<CampoGiorno etichetta="Inizio" valore={oggi.ms} onCambia={() => {}} ora={ORA} scorciatoie={presetPassato} />);
    expect(html).toContain(">Oggi<");
  });
  it("48: Segna incassata usa CampoGiorno, niente campo data nativo", () => {
    const f = { id: "F1", kind: "setup", cliente: "Officina", amountCents: 100_000, number: "12", period: null, issuedAt: ORA - 86_400_000, dueAt: ORA + 86_400_000, paidAt: null, pdfUrl: null, stato: "emessa" } as unknown as Parameters<typeof FoglioFattura>[0]["f"];
    const html = render(<FoglioFattura f={f} ora={ORA} onChiudi={() => {}} />, { percorso: "/economia" });
    expect(html).not.toContain('type="date"');
    expect(html).toContain('data-selettore="Incassata il"');
    expect(html).toContain(">Oggi<");
  });
  it("minore 3: la call nel passato si legge sotto la data", () => {
    const e = new ApiError(422, "La call è nel passato: scegli giorno e ora da adesso in poi");
    expect(eCallNelPassato(e)).toBe(true);
    expect(eCallNelPassato(new ApiError(422, "Altro"))).toBe(false);
    const html = render(<CampoQuando etichetta="Giorno e ora" valore={null} onCambia={() => {}} ora={ORA} errore={e.message} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("La call è nel passato");
  });
});

describe("Voci 47 e 49", () => {
  it("49: la chip resta su una riga", () => {
    expect(render(<Tag>in attesa di attivazione</Tag>)).toContain("whitespace-nowrap");
  });
  it("47: la barra in fondo ha il fondo della pagina e non copre il contenuto", () => {
    const html = render(<Fasi />, { percorso: "/impostazioni/fasi", dati: [[["stages"], FASI], [["stage-rules"], []], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], []]] });
    expect(html).toMatch(/sticky bottom-20[^"]*bg-crema/);
  });
});
