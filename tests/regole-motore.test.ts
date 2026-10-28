import { describe, expect, it } from "vitest";
import { CONTESTO_BASE, finePausa, propostaEsito, propostaEvento, type Contesto } from "../worker/regole/motore";

const r = (g: number, h: number, m = 0) => Date.UTC(2026, 9, g, h - 2, m); // ottobre 2026 prima del 25: Roma = UTC+2
const ORA = r(13, 10); // martedì
const ctx = (extra: Partial<Contesto> = {}): Contesto => ({ ...CONTESTO_BASE, ora: ORA, sequenze: true, ...extra });

describe("le regole sanno quale call c'è stata (spec 6.3)", () => {
  it("call di conoscenza fissata", () => {
    expect(propostaEvento({ tipo: "call_fissata", kind: "conoscenza", scheduledAt: r(15, 11) }, ctx()))
      .toMatchObject({ stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: r(15, 11) });
  });
  it("call di presentazione fissata", () => {
    expect(propostaEvento({ tipo: "call_fissata", kind: "presentazione", scheduledAt: r(20, 11) }, ctx()))
      .toMatchObject({ stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: r(20, 11) });
  });
  it("call di conoscenza fatta con la presentazione fissata", () => {
    expect(propostaEvento({ tipo: "call_fatta", kind: "conoscenza", presentazioneAt: r(20, 11) }, ctx()))
      .toMatchObject({ stageId: "presentazione-confermata", nextAction: "Preparare il preventivo", nextActionAt: r(15, 19, 30) });
  });
  it("call di conoscenza fatta senza data della presentazione", () => {
    expect(propostaEvento({ tipo: "call_fatta", kind: "conoscenza", presentazioneAt: null }, ctx()))
      .toMatchObject({ stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo" });
  });
  it("call saltata riparte dai tentativi", () => {
    expect(propostaEvento({ tipo: "call_saltata" }, ctx()))
      .toMatchObject({ stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: r(14, 10), attemptCount: 0, sequenceStep: 0 });
  });
  it("proposta registrata dal wiki: promemoria solo se manca la call di presentazione", () => {
    expect(propostaEvento({ tipo: "proposta_registrata", haCallPresentazione: false }, ctx()))
      .toEqual({ stageId: null, nextAction: "Fissare la call di presentazione", nextActionAt: r(14, 10) });
    expect(propostaEvento({ tipo: "proposta_registrata", haCallPresentazione: true }, ctx()))
      .toEqual({ stageId: null, nextAction: null, nextActionAt: null });
  });
  it("call di presentazione fatta: in attesa decisione, follow-up a 3 giorni", () => {
    expect(propostaEvento({ tipo: "call_fatta", kind: "presentazione" }, ctx()))
      .toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: r(16, 10), sequenceStep: 1 });
  });
  it("ricontatto a 3 senza risposta: a 7, poi a 14", () => {
    const base = r(13, 10);
    expect(propostaEvento({ tipo: "ricontatto_senza_risposta", base, passo: 1 }, ctx())).toMatchObject({ stageId: null, nextActionAt: r(20, 10), sequenceStep: 2 });
    expect(propostaEvento({ tipo: "ricontatto_senza_risposta", base, passo: 2 }, ctx())).toMatchObject({ stageId: null, nextActionAt: r(27, 10) + 3_600_000, sequenceStep: 3 });
  });
  it("dopo il 14 senza risposta: probabilmente bloccato con pausa di 2 mesi", () => {
    const p = propostaEvento({ tipo: "ricontatto_senza_risposta", base: r(13, 10), passo: 3 }, ctx());
    expect(p).toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Richiamare dopo la pausa" });
    expect(p.pausedUntil).toBe(Date.UTC(2026, 11, 14, 9, 0)); // 14 dicembre alle 10 di Roma (ora solare), primo giorno di lavoro dopo il 13
    expect(p.nextActionAt).toBe(p.pausedUntil);
  });
  it("proposta mandata senza call di presentazione: ricontatti dalla data di invio", () => {
    expect(propostaEvento({ tipo: "proposta_senza_call", sentAt: r(13, 9) }, ctx()))
      .toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: r(16, 10), sequenceStep: 1 });
  });
});

describe("tentativi da 1 a 5", () => {
  const lead = (attemptCount: number) => ({ stageId: "da-richiamare", attemptCount, primoTentativoAt: attemptCount === 0 ? null : r(13, 9) });
  it("1: dopo la prima chiamata, WhatsApp Non ti ho trovato subito", () => {
    expect(propostaEsito("non_risponde", { ...lead(0), stageId: "da-chiamare-prima-volta" }, ctx()))
      .toMatchObject({ stageId: "da-richiamare", nextAction: "WhatsApp: Non ti ho trovato", nextActionAt: ORA, attemptCount: 1, passo: "Tentativo 1 di 5" });
  });
  it("2: dopo il WhatsApp, seconda chiamata il giorno dopo alle 10", () => {
    expect(propostaEsito("non_risponde", lead(1), ctx())).toMatchObject({ nextAction: "Seconda chiamata", nextActionAt: r(14, 10), attemptCount: 2 });
  });
  it("3: email Ti ho cercato il giorno dopo ancora", () => {
    expect(propostaEsito("non_risponde", lead(2), ctx())).toMatchObject({ nextAction: "Email: Ti ho cercato", nextActionAt: r(15, 10), attemptCount: 3 });
  });
  it("4: terza chiamata", () => {
    expect(propostaEsito("non_risponde", lead(3), ctx())).toMatchObject({ nextAction: "Terza chiamata", nextActionAt: r(16, 10), attemptCount: 4 });
  });
  // Contratto blocco 1, fase 20: dopo il quinto tentativo pausa di 2 mesi, poi un'ultima chiamata, poi Non interessato.
  // 13 dicembre 2026 è domenica (chiuso): la pausa finisce lunedì 14 alle 10 (Roma = UTC+1).
  it("5: propone la pausa di due mesi in Da richiamare, senza chiudere", () => {
    expect(propostaEsito("non_risponde", lead(4), ctx()))
      .toMatchObject({ stageId: "da-richiamare", nextAction: "Richiamare dopo la pausa", pausedUntil: Date.UTC(2026, 11, 14, 9), attemptCount: 5, passo: "Tentativo 5 di 5" });
  });
  it("l'ultima chiamata dopo la pausa a vuoto chiude con motivo Non ha mai risposto", () => {
    expect(propostaEsito("non_risponde", lead(5), ctx()))
      .toMatchObject({ stageId: "non-chiuso", lostReason: "mai_risposto", nextAction: null, nextActionAt: null, attemptCount: 6 });
  });
  it("con le sequenze spente propone solo Richiamare domani alle 10", () => {
    expect(propostaEsito("non_risponde", lead(1), ctx({ sequenze: false }))).toMatchObject({ stageId: null, nextAction: "Richiamare", nextActionAt: r(14, 10), attemptCount: 2 });
  });
});

describe("esiti del Foglio Esito (DS 6.6)", () => {
  const lead = { stageId: "da-richiamare", attemptCount: 0, primoTentativoAt: null };
  it.each([
    ["risposto", { stageId: null, nextAction: "Follow-up", nextActionAt: r(16, 10) }],
    ["occupato", { stageId: null, nextAction: "Richiamare", nextActionAt: ORA + 3_600_000 }],
    ["richiamare", { stageId: "da-richiamare", nextAction: "Richiamare", nextActionAt: r(14, 10) }],
    ["non_interessato", { stageId: "non-chiuso", lostReason: "non_interessato", nextAction: null }],
    ["fuori_target", { stageId: "fake", lostReason: "fuori_target", nextAction: null }],
  ] as const)("%s", (esito, attesa) => {
    expect(propostaEsito(esito, lead, ctx())).toMatchObject(attesa);
  });
  it("appuntamento usa la data della call", () => {
    expect(propostaEsito("appuntamento", lead, ctx(), { scheduledAt: r(15, 11) }))
      .toMatchObject({ stageId: "appuntamento-confermato", nextAction: "Call di conoscenza", nextActionAt: r(15, 11) });
  });
});

// Riunione del 26/10: dopo la consulenza la prossima azione è preparare il preventivo il giorno dopo,
// non di nuovo "Call di conoscenza"; dopo la presentazione si aspetta la decisione.
describe("esiti dopo la consulenza e la presentazione", () => {
  const lead = (stageId: string) => ({ stageId, attemptCount: 0, primoTentativoAt: null });
  // Ipotesi 9 del contratto: preventivo entro 2 giorni lavorativi, a fine orario.
  it("consulenza fatta: In attesa preventivo, preparare il preventivo entro 2 giorni lavorativi", () => {
    expect(propostaEsito("consulenza_fatta", lead("appuntamento-confermato"), ctx()))
      .toEqual({ stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: r(15, 19, 30) });
  });
  it("i 2 giorni lavorativi saltano il giorno chiuso", () => {
    // Venerdì 16 ottobre: sabato lavora, domenica no, quindi lunedì 19.
    expect(propostaEsito("consulenza_fatta", lead("appuntamento-confermato"), ctx({ ora: r(16, 10) })).nextActionAt).toBe(r(19, 19, 30));
  });
  it("presentazione fissata usa la data della call", () => {
    expect(propostaEsito("presentazione_fissata", lead("in-attesa-preventivo"), ctx(), { scheduledAt: r(16, 15) }))
      .toEqual({ stageId: "presentazione-confermata", nextAction: "Call di presentazione", nextActionAt: r(16, 15) });
  });
  it("presentazione fatta: In attesa decisione con il primo follow-up", () => {
    expect(propostaEsito("presentazione_fatta", lead("presentazione-confermata"), ctx()))
      .toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: r(16, 10) });
  });
  it("la call di conoscenza fatta porta anche lei al preventivo entro 2 giorni lavorativi", () => {
    expect(propostaEvento({ tipo: "call_fatta", kind: "conoscenza", presentazioneAt: null }, ctx()))
      .toEqual({ stageId: "in-attesa-preventivo", nextAction: "Preparare il preventivo", nextActionAt: r(15, 19, 30) });
  });
});

describe("fine pausa", () => {
  it("scrive la prossima azione solo quando la pausa è finita", () => {
    expect(finePausa({ pausedUntil: ORA + 1 }, ORA)).toBeNull();
    expect(finePausa({ pausedUntil: ORA - 1 }, ORA)).toEqual({ nextAction: "Richiamare dopo la pausa", nextActionAt: ORA });
    expect(finePausa({ pausedUntil: null }, ORA)).toBeNull();
  });
});

describe("casi limite", () => {
  it("con le sequenze spente gli eventi non propongono passi di sequenza", () => {
    const off = ctx({ sequenze: false });
    expect(propostaEvento({ tipo: "call_fatta", kind: "presentazione" }, off)).not.toHaveProperty("sequenceStep");
    expect(propostaEvento({ tipo: "proposta_senza_call", sentAt: r(13, 9) }, off)).not.toHaveProperty("sequenceStep");
    expect(propostaEvento({ tipo: "ricontatto_senza_risposta", base: r(13, 10), passo: 1 }, off)).not.toHaveProperty("sequenceStep");
    expect(propostaEvento({ tipo: "call_fatta", kind: "presentazione" }, off)).toMatchObject({ stageId: "in-attesa-decisione", nextAction: "Follow-up preventivo", nextActionAt: r(16, 10) });
  });
  it("la pausa che finisce in un mese più corto si ferma all'ultimo giorno del mese", () => {
    // 31 ottobre (ora solare, Roma = UTC+1) più un mese: 30 novembre, lunedì, alle 10 di Roma.
    const p = propostaEvento({ tipo: "ricontatto_senza_risposta", base: r(13, 10), passo: 3 }, ctx({ ora: Date.UTC(2026, 9, 31, 9, 0), pausaMesi: 1 }));
    expect(p.pausedUntil).toBe(Date.UTC(2026, 10, 30, 9, 0));
  });
  it("con più tentativi dei passi previsti, oltre il quarto propone Richiamare domani alle 10", () => {
    const lead = { stageId: "da-richiamare", attemptCount: 4, primoTentativoAt: r(13, 9) };
    expect(propostaEsito("non_risponde", lead, ctx({ massimoTentativi: 7 })))
      .toMatchObject({ stageId: null, nextAction: "Richiamare", nextActionAt: r(14, 10), attemptCount: 5, passo: "Tentativo 5 di 7" });
  });
});
