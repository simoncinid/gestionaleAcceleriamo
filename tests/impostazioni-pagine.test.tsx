import { describe, expect, it } from "vitest";
import { Fasi, FoglioFase, campiFase } from "../src/pagine/impostazioni/Fasi";
import { sintesiRegola } from "../src/pagine/impostazioni/regole";
import { IntegrazioneDettaglio } from "../src/pagine/impostazioni/IntegrazioneDettaglio";
import { Integrazioni } from "../src/pagine/impostazioni/Integrazioni";
import { FoglioModello, Modelli } from "../src/pagine/impostazioni/Modelli";
import { Stato } from "../src/pagine/impostazioni/Stato";
import { ApiError } from "../src/api";
import { Login, messaggioAccesso } from "../src/pagine/Login";
import type { StatoSistema } from "../src/types";
import { IMPOSTAZIONI_DEFAULT } from "../worker/impostazioni/default";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 13, 8, 0);
const stato: StatoSistema = {
  integrazioni: [
    { key: "meta", etichetta: "Meta", stato: "ok", ultimaOk: ORA - 3_600_000, nota: null },
    { key: "foglio", etichetta: "Foglio Andrea", stato: "spento", ultimaOk: null, nota: "Non collegato: manca il link del foglio" },
    { key: "aggancio", etichetta: "Aggancio proposte", stato: "mai", ultimaOk: null, nota: "Non ha ancora lavorato" },
    { key: "resend", etichetta: "Resend", stato: "errore", ultimaOk: ORA - 86_400_000, nota: "Resend 500: errore finto" },
    { key: "push", etichetta: "Push", stato: "spento", ultimaOk: null, nota: "Non ancora attivo" },
    { key: "telegram", etichetta: "Telegram", stato: "spento", ultimaOk: null, nota: "Non ancora attivo" },
    { key: "claude", etichetta: "Claude", stato: "spento", ultimaOk: null, nota: "Non ancora attivo" },
    { key: "giro", etichetta: "Giro programmato", stato: "ok", ultimaOk: ORA - 120_000, nota: null },
  ],
  settimana: { meta: 4, foglio: 2, aggancio: 1 },
  errori: [{ key: "resend", etichetta: "Resend", errore: "Resend 500: errore finto", errorId: "ab12cd34", at: ORA - 600_000 }],
  segreti: { meta: true, resend: true, google: false, aggancio: true },
  foglio: { ultimaRiga: 41, ultimaLettura: null },
};
// Niente segreti, niente foglio: tutto "non collegato", niente rosso.
const scollegato: StatoSistema = {
  ...stato,
  integrazioni: stato.integrazioni.map((i) => (["meta", "foglio", "aggancio", "resend"].includes(i.key) ? { ...i, stato: "spento" as const, nota: `Non collegato: ${i.key}` } : i)),
  errori: [],
  segreti: { meta: false, resend: false, google: false, aggancio: false },
};
const fasi = [
  { id: "da-chiamare-prima-volta", label: "Da chiamare", sortOrder: 1, kind: "open", tone: "accento", probability: 5, suggestedNextAction: "Chiamare", suggestedDelayHours: 2, requiresReason: false },
  { id: "perso", label: "Perso", sortOrder: 9, kind: "lost", tone: "grigio", probability: 0, suggestedNextAction: null, suggestedDelayHours: null, requiresReason: true },
];
const regole = [
  { id: "sla-prima", ruleKey: "sla", stageId: "da-chiamare-prima-volta", event: null, params: { minuti: 120, avvisoMinuti: 90 }, active: true },
  { id: "ricontatti-decisione", ruleKey: "ricontatti", stageId: null, event: null, params: { giorni: [3, 7, 14] }, active: true },
];
const utenti = [{ id: "diego", name: "Diego" }, { id: "tommaso", name: "Tommaso" }];
const LINEETTE = /[\u2013\u2014]/;
// Dalla 1B l'elenco porta a una pagina per integrazione: elenco e dettagli insieme coprono quello che prima stava in una pagina sola.
const integrazioniIntere = (s: StatoSistema) => {
  const dati: [unknown[], unknown][] = [[["integrazioni"], s], [["settings"], IMPOSTAZIONI_DEFAULT], [["aggancio-registro"], []]];
  const elenco = render(<Integrazioni ora={ORA} />, { percorso: "/impostazioni/integrazioni", dati });
  const dettagli = ["foglio", "aggancio", "resend"].map((k) => render(<IntegrazioneDettaglio ora={ORA} />, { percorso: `/impostazioni/integrazioni/${k}`, rotta: "/impostazioni/integrazioni/:key", dati }));
  return { elenco, dettagli, html: [elenco, ...dettagli].join("") };
};

describe("Impostazioni", () => {
  it("Stato: un semaforo per riga, il rosso porta all'integrazione, errori col codice, nessun primario", () => {
    const html = render(<Stato ora={ORA} onEsci={() => {}} />, { dati: [[["integrazioni"], stato]] });
    expect(html).toContain('href="/impostazioni/integrazioni/resend"');
    expect(html).toContain("Ultima volta oggi 09:00");
    expect(html).toContain("Non ancora attivo");
    expect(html).toMatch(/<strong[^>]*>4<\/strong> lead dal webhook Meta/);
    expect(html).toContain("Codice ab12cd34");
    expect(html).toContain('href="/impostazioni/fasi"');
    expect(html).toContain("Esci dall&#x27;account");
    expect(contaPrimari(html)).toBe(0);
    expect(html).not.toMatch(LINEETTE);
  });

  it("Stato senza segreti: non collegato, nessun errore, niente rosso", () => {
    const html = render(<Stato ora={ORA} onEsci={() => {}} />, { dati: [[["integrazioni"], scollegato]] });
    expect(html).toContain("Non collegato");
    expect(html).not.toContain("bg-errore");
    expect(html).not.toContain("Ultimi errori");
  });

  it("Stato: giro programmato fermo da più di 20 minuti diventa rosso con l'ora dell'ultimo giro", () => {
    const fermo: StatoSistema = { ...stato, integrazioni: stato.integrazioni.map((i) => (i.key === "giro" ? { ...i, ultimaOk: ORA - 25 * 60_000 } : i)) };
    const html = render(<Stato ora={ORA} onEsci={() => {}} />, { dati: [[["integrazioni"], fermo]] });
    expect(html).toContain("Ultimo giro alle 09:35, atteso ogni 5 minuti");
    expect(html).toContain("2 da controllare");
    const inOrario = render(<Stato ora={ORA} onEsci={() => {}} />, { dati: [[["integrazioni"], stato]] });
    expect(inOrario).not.toContain("atteso ogni 5 minuti");
  });

  it("Fasi e regole: un solo primario, selettori e nessun select nativo, ricontatti come lista, motivi gestibili", () => {
    const html = render(<Fasi />, { dati: [[["stages"], fasi], [["stage-rules"], regole], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], utenti]] });
    expect(contaPrimari(html)).toBe(1);
    expect(html).toContain("Salva le regole");
    expect(html).toContain('data-selettore="Si aggancia a"');
    expect(html).toContain('data-selettore="Prima chiamata"');
    expect(html).toContain('value="3, 7, 14"');
    expect(html).toContain("Aggiungi un motivo");
    expect(html).toContain('value="Non raggiungibile"');
    expect(html).not.toContain("<select");
    expect(html).not.toMatch(LINEETTE);
  });

  it("QA 11: le fasi sono un elenco in sola lettura, una riga per fase, niente moduli né riordino nella pagina", () => {
    const html = render(<Fasi />, { dati: [[["stages"], fasi], [["stage-rules"], regole], [["settings"], IMPOSTAZIONI_DEFAULT], [["users"], utenti]] });
    const righe = [...html.matchAll(/<button [^>]*data-fase="([^"]+)"[^>]*>(.*?)<\/button>/gs)];
    expect(righe.map((r) => r[1])).toEqual(["da-chiamare-prima-volta", "perso"]);
    const [prima, persa] = righe.map((r) => r[2]);
    expect(prima).toContain(">Da chiamare<");
    expect(prima).toContain(">Prima chiamata entro 2 ore<");
    expect(prima).toContain(">Azione proposta: Chiamare<");
    expect(persa).toContain(">Nessuna scadenza<");
    expect(persa).toContain(">Nessuna azione proposta<");
    for (const r of [prima, persa]) {
      expect(r).not.toContain("truncate");
      expect(r).not.toContain("<input");
    }
    expect(html).not.toContain('value="Da chiamare"');
    expect(html).not.toContain("Sposta su");
    expect(html).not.toContain("Riordina");
  });

  it("QA 11: il foglio della fase ha solo i suoi tre campi e Salva la fase come unica azione", () => {
    const html = render(<FoglioFase fase={fasi[0] as never} onChiudi={() => {}} />);
    expect(html).toContain('value="Da chiamare"');
    expect(html).toContain('value="5"');
    expect(html).toContain('value="Chiamare"');
    expect(html).toContain("Salva la fase");
    expect(contaPrimari(html)).toBe(1);
    expect(html).not.toContain("Salva le regole");
  });

  it("QA 11: la PATCH porta solo i campi cambiati, con errori in italiano", () => {
    const f = { label: "Da chiamare", probability: 5, suggestedNextAction: "Chiamare" };
    expect(campiFase(f, { nome: "Da chiamare", probabilita: "5", azione: "Chiamare" })).toEqual({ campi: {} });
    expect(campiFase(f, { nome: " Nuovi ", probabilita: "10", azione: "" })).toEqual({ campi: { label: "Nuovi", probability: 10, suggestedNextAction: null } });
    expect(campiFase(f, { nome: "", probabilita: "5", azione: "" })).toEqual({ errore: "La fase ha bisogno di un nome" });
    expect(campiFase(f, { nome: "x", probabilita: "120", azione: "" })).toEqual({ errore: "Probabilità: un numero da 0 a 100" });
  });

  it("sintesi delle regole, al singolare e al plurale", () => {
    expect(sintesiRegola({ ruleKey: "sla", params: { minuti: 90 } })).toBe("Prima chiamata entro 90 minuti");
    expect(sintesiRegola({ ruleKey: "sla", params: { minuti: 60 } })).toBe("Prima chiamata entro 1 ora");
    expect(sintesiRegola({ ruleKey: "tentativi", params: { massimo: 5 } })).toBe("Pausa dopo 5 tentativi");
    expect(sintesiRegola({ ruleKey: "ricontatti", params: { giorni: [3, 7, 14] } })).toBe("Ricontatti dopo 3, 7, 14 giorni");
    expect(sintesiRegola({ ruleKey: "pausa", params: { mesi: 1 } })).toBe("In pausa per 1 mese");
  });

  it("Modelli: una riga per modello, Aggiungi in fondo, il primario sta solo nel foglio", () => {
    const modelli = [{ id: "mod-primo-contatto", channel: "whatsapp", key: "primo_contatto", title: "Primo contatto", subject: null, body: "Ciao {referente}", stageId: "da-chiamare-prima-volta", sortOrder: 10 }];
    const html = render(<Modelli />, { dati: [[["templates"], modelli], [["stages"], fasi]] });
    expect(html).toContain("Primo contatto");
    expect(html).toContain("Fase: Da chiamare");
    expect(html).toContain("Aggiungi un modello");
    expect(contaPrimari(html)).toBe(0);
  });

  it("Modello di sistema: canale in sola lettura, una riga per ogni variabile", () => {
    const sistema = { id: "mod-primo-contatto", key: "primo_contatto", channel: "whatsapp" as const, title: "Primo contatto", subject: "", body: "Ciao {referente}", stageId: "nessuna" };
    const html = render(<FoglioModello iniziale={sistema} fasi={[]} onChiudi={() => {}} />);
    expect(html).not.toContain('data-selettore="Canale"');
    expect(html).toContain("Canale: WhatsApp");
    for (const v of ["{referente}", "{azienda}", "{numero}"]) expect(html).toContain(v);
    expect(html).toContain("primo nome del contatto");
    const mio = render(<FoglioModello iniziale={{ ...sistema, id: null, key: null }} fasi={[]} onChiudi={() => {}} />);
    expect(mio).toContain('data-selettore="Canale"');
  });

  it("Integrazioni: stato, configurazione e prova per ognuna; link intero del foglio; segreti solo presenti o mancanti; nessun primario", () => {
    const { html, elenco, dettagli } = integrazioniIntere(stato);
    for (const t of ["Leggi adesso", "Anteprima della mappa", "Proposta di prova", "Manda un&#x27;email di prova a me", "Account di servizio: mancante", "Ultima riga letta: 41", "In arrivo con il passaggio a cliente", "Link della scheda"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain('id="resend"');
    expect(html).not.toContain("Id del foglio");
    for (const pagina of [elenco, ...dettagli]) expect(contaPrimari(pagina)).toBe(0);
    expect(html).not.toMatch(LINEETTE);
  });

  it("Integrazioni senza segreti: Non collegato al posto dell'errore, prove spente con il motivo", () => {
    const { html } = integrazioniIntere(scollegato);
    expect(html).toContain("Non collegato");
    expect(html).not.toContain("text-errore");
    expect(html).toMatch(/aria-disabled="true"[^>]*>Proposta di prova/);
    expect(html).toMatch(/aria-disabled="true"[^>]*>Manda un&#x27;email di prova a me/);
  });
});

describe("Login", () => {
  it("senza rete il messaggio è in italiano; gli errori del server passano come sono", () => {
    expect(messaggioAccesso(new TypeError("Failed to fetch"))).toBe("Connessione assente, riprova");
    expect(messaggioAccesso(new ApiError(401, "Utente o password sbagliati"))).toBe("Utente o password sbagliati");
  });

  it("logo, utente e password, un solo pulsante primario: Entra", () => {
    const html = render(<Login />);
    expect(html).toContain('src="/brand/logo.svg"');
    expect(html).toMatch(/autocomplete="username"/i);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain(">Utente</label>");
    expect(html).toContain(">Password</label>");
    expect(html).toContain(">Entra</button>");
    expect(contaPrimari(html)).toBe(1);
    expect(html).not.toContain("<select");
    expect(html).not.toMatch(LINEETTE);
  });
});
