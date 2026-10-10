import { describe, expect, it } from "vitest";
import { FoglioCerca } from "../src/guscio/FoglioCerca";
import { Dati } from "../src/pagine/impostazioni/Dati";
import { ImportaCsv } from "../src/pagine/impostazioni/ImportaCsv";
import { Registro } from "../src/pagine/impostazioni/Registro";
import { Stato } from "../src/pagine/impostazioni/Stato";
import { IntegrazioneDettaglio } from "../src/pagine/impostazioni/IntegrazioneDettaglio";
import { Integrazioni } from "../src/pagine/impostazioni/Integrazioni";
import { Utenti } from "../src/pagine/impostazioni/Utenti";
import { contaPrimari, render } from "./render";

const ORA = Date.UTC(2026, 9, 12, 9);
const stato = {
  integrazioni: [
    { key: "meta", etichetta: "Meta", stato: "ok", ultimaOk: ORA - 25 * 60_000, nota: null },
    { key: "push", etichetta: "Push", stato: "spento", ultimaOk: null, nota: "Mancano le chiavi VAPID" },
    { key: "claude", etichetta: "Claude", stato: "ok", ultimaOk: ORA, nota: null, extra: { spesoCents: 1_100, tettoCents: 2_000 } },
    { key: "giro", etichetta: "Giro programmato", stato: "ok", ultimaOk: ORA, nota: null },
  ],
  settimana: { meta: 5, foglio: 2, aggancio: 3 }, errori: [], segreti: { meta: true, resend: false, google: false, aggancio: true }, foglio: { ultimaRiga: 0, ultimaLettura: null },
};
const profilo = { id: "tommaso", name: "Tommaso Rovini", username: "tommaso", telegram: true, notifyPrefs: { lead_nuovo: true }, quietHours: { attive: true, da: "22:00", a: "07:30" }, dispositivi: 2 };

describe("Impostazioni della 1B", () => {
  it("Integrazioni è un elenco: una riga per voce, senza il giro, nessun primario", () => {
    const html = render(<Integrazioni ora={ORA} />, { percorso: "/impostazioni/integrazioni", dati: [[["integrazioni"], stato]] });
    expect(html).toContain('href="/impostazioni/integrazioni/push"');
    expect(html).toContain("Non collegato");
    expect(html).toMatch(/11.*su.*20/);
    expect(html).not.toContain("Giro programmato");
    expect(contaPrimari(html)).toBe(0);
  });
  it("dettaglio di Push senza chiavi: cosa manca, in parole semplici", () => {
    const html = render(<IntegrazioneDettaglio ora={ORA} />, { percorso: "/impostazioni/integrazioni/push", rotta: "/impostazioni/integrazioni/:key", dati: [[["integrazioni"], stato], [["settings"], {}], [["push-dispositivi"], { dispositivi: [] }]] });
    expect(html).toContain("Mancano le chiavi VAPID");
    expect(html).not.toContain("wrangler secret put");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Utenti e profilo: due soci, le righe del profilo", () => {
    const html = render(<Utenti />, { percorso: "/impostazioni/utenti", dati: [[["users"], [{ id: "tommaso", name: "Tommaso Rovini" }, { id: "diego", name: "Diego Simoncini" }]], [["me", "profilo"], profilo]] });
    for (const t of ["Diego Simoncini", "Socio", "Password", "Dispositivi push", "Telegram", "Avvisi per evento", "Ore di silenzio", "dalle 22:00 alle 07:30"]) expect(html).toContain(t);
    expect(contaPrimari(html)).toBe(0);
  });
  it("Dati: cestino, importa, esporta, registro, spazio demo", () => {
    const html = render(<Dati />, { percorso: "/impostazioni/dati", dati: [[["dati", "riepilogo"], { cestino: 3, ultimaModifica: ORA, demoUrl: "https://demo.esempio.it" }]] });
    for (const t of ["Cestino", "Importa lead da CSV", "Esporta", "Registro delle modifiche", "Spazio demo"]) expect(html).toContain(t);
    expect(html).toContain("3 lead: restano lì finché non li ripristini");
    expect(html).not.toContain("30 giorni");
    expect(contaPrimari(html)).toBe(0);
  });
  it("FoglioCerca aperto: campo e comandi", () => {
    const html = render(<FoglioCerca aperto onChiudi={() => {}} onCrea={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).toContain("Cerca lead, proposte, automazioni, fatture");
    expect(html).toContain("Nuovo lead");
    expect(html).toContain("Vai a Campagne");
  });
  it("dettaglio di Claude: speso e tetto in euro, nessun primario", () => {
    const uso = { collegato: true, spesoCents: 1_100, tettoCents: 2_000, avvisoCents: 1_500, fermi: 2, perTipo: [{ tipo: "scheda", lavori: 4, costoCents: 300 }], modelli: { scheda: "claude-sonnet" } };
    const html = render(<IntegrazioneDettaglio ora={ORA} />, { percorso: "/impostazioni/integrazioni/claude", rotta: "/impostazioni/integrazioni/:key", dati: [[["integrazioni"], stato], [["settings"], {}], [["claude", "uso"], uso]] });
    expect(html).toMatch(/11,00.*su.*20,00/);
    expect(html).toContain("2 lavori fermi");
    expect(html).toContain("Scheda azienda");
    expect(contaPrimari(html)).toBe(0);
  });
  it("dettaglio di Claude senza chiave: Non collegato, nessun errore", () => {
    const senza = { ...stato, integrazioni: stato.integrazioni.map((i) => (i.key === "claude" ? { ...i, stato: "spento", nota: "Non collegato", extra: undefined } : i)) };
    const html = render(<IntegrazioneDettaglio ora={ORA} />, { percorso: "/impostazioni/integrazioni/claude", rotta: "/impostazioni/integrazioni/:key", dati: [[["integrazioni"], senza], [["settings"], {}]] });
    expect(html).toContain("Non collegato");
    expect(html).toContain("Manca la chiave di Anthropic");
    expect(html).not.toContain('role="alert"');
  });
  it("dettaglio di Telegram: i tre eventi, la chat collegata, scollega", () => {
    const conTelegram = { ...stato, integrazioni: [...stato.integrazioni, { key: "telegram", etichetta: "Telegram", stato: "ok", ultimaOk: ORA, nota: null }] };
    const html = render(<IntegrazioneDettaglio ora={ORA} />, { percorso: "/impostazioni/integrazioni/telegram", rotta: "/impostazioni/integrazioni/:key", dati: [[["integrazioni"], conTelegram], [["settings"], {}], [["me", "profilo"], profilo]] });
    expect(html).toContain("Lead nuovo, Prima chiamata scaduta, Claude al tetto del mese");
    expect(html).toContain("La tua chat è collegata");
    expect(html).toContain("Scollega la tua chat");
    expect(contaPrimari(html)).toBe(0);
  });
  it("Stato: il semaforo rosso porta al dettaglio, Dati al posto di Cestino", () => {
    const rosso = { ...stato, integrazioni: stato.integrazioni.map((i) => (i.key === "meta" ? { ...i, stato: "errore", nota: "Token scaduto" } : i)) };
    const html = render(<Stato ora={ORA} onEsci={() => {}} />, { percorso: "/impostazioni", dati: [[["integrazioni"], rosso], [["notifications"], { avvisi: [], nonLetti: 0 }]] });
    expect(html).toContain('href="/impostazioni/integrazioni/meta"');
    expect(html).toContain('href="/impostazioni/dati"');
    expect(html).toContain('href="/impostazioni/utenti"');
    expect(html).not.toContain('href="/impostazioni/dati/cestino"');
    expect(html).toContain("Token scaduto");
  });
  it("Registro: chi, cosa, quando; vuoto disegnato", () => {
    const voci = { pages: [{ voci: [{ id: "a1", at: ORA, chi: "Tommaso Rovini", entita: "import", azione: "importa 3 lead", entityId: "csv" }], prossimo: null }], pageParams: [null] };
    const html = render(<Registro />, { percorso: "/impostazioni/dati/registro", dati: [[["audit"], voci]] });
    expect(html).toContain("Importazione: importa 3 lead");
    expect(html).toContain("Tommaso Rovini");
    expect(contaPrimari(html)).toBe(0);
    const vuoto = render(<Registro />, { percorso: "/impostazioni/dati/registro", dati: [[["audit"], { pages: [{ voci: [], prossimo: null }], pageParams: [null] }]] });
    expect(vuoto).toContain("Nessuna modifica registrata");
  });
  it("ImportaCsv: istruzioni e campo file, nessun primario prima dell'anteprima", () => {
    const html = render(<ImportaCsv />, { percorso: "/impostazioni/dati/importa" });
    expect(html).toContain("Azienda");
    expect(html).toContain('type="file"');
    expect(contaPrimari(html)).toBe(0);
  });
  it("Dati: cestino vuoto e registro senza voci", () => {
    const html = render(<Dati />, { percorso: "/impostazioni/dati", dati: [[["dati", "riepilogo"], { cestino: 0, ultimaModifica: null, demoUrl: null }]] });
    expect(html).toContain("Vuoto");
    expect(html).toContain("Nessuna voce");
  });
  it("FoglioCerca chiuso: non mostra niente", () => {
    const html = render(<FoglioCerca aperto={false} onChiudi={() => {}} onCrea={() => {}} />, { percorso: "/commerciale/oggi" });
    expect(html).not.toContain("Nuovo lead");
  });
});
