import { describe, expect, it } from "vitest";
import { aggancioDi, bozzaDi, corpoRegole, daAggancio, daLinkFoglio, linkDelFoglio, opzioniAggancio, type RegolaLetta } from "../src/pagine/impostazioni/regole";

const sla: RegolaLetta = { id: "sla-prima", ruleKey: "sla", stageId: "da-chiamare-prima-volta", event: null, params: { minuti: 120, avvisoMinuti: 90 }, active: true };
const ricontatti: RegolaLetta = { id: "ricontatti-decisione", ruleKey: "ricontatti", stageId: "in-attesa-decisione", event: null, params: { giorni: [3, 7, 14] }, active: true };
const preventivo: RegolaLetta = { id: "preventivo-48h", ruleKey: "preventivo_48h", stageId: null, event: "call_conoscenza_fatta", params: { ore: 48 }, active: true };

describe("regole in Impostazioni", () => {
  it("aggancio: fase, evento o tutte le fasi aperte", () => {
    expect(aggancioDi(sla)).toBe("fase:da-chiamare-prima-volta");
    expect(aggancioDi(preventivo)).toBe("evento:call_conoscenza_fatta");
    expect(aggancioDi({ stageId: null, event: null })).toBe("tutte");
    expect(daAggancio("evento:call_conoscenza_fatta")).toEqual({ stageId: null, event: "call_conoscenza_fatta" });
    expect(daAggancio("tutte")).toEqual({ stageId: null, event: null });
  });

  it("le opzioni mostrano solo le fasi aperte, poi gli eventi", () => {
    const fasi = [{ id: "a", label: "Da chiamare", kind: "open" }, { id: "b", label: "Perso", kind: "lost" }];
    expect(opzioniAggancio(fasi).map((o) => o.etichetta)).toEqual(["Tutte le fasi aperte", "Da chiamare", "Dopo la call di conoscenza"]);
  });

  it("la bozza torna uguale al corpo da salvare", () => {
    expect(corpoRegole([bozzaDi(sla), bozzaDi(preventivo)])).toEqual({
      rules: [
        { id: "sla-prima", stageId: "da-chiamare-prima-volta", event: null, params: { minuti: 120, avvisoMinuti: 90 }, active: true },
        { id: "preventivo-48h", stageId: null, event: "call_conoscenza_fatta", params: { ore: 48 }, active: true },
      ],
    });
  });

  it("i ricontatti si scrivono come lista", () => {
    const b = bozzaDi(ricontatti);
    expect(b.valori.giorni).toBe("3, 7, 14");
    expect(corpoRegole([{ ...b, valori: { giorni: "2,5" } }])).toMatchObject({ rules: [{ params: { giorni: [2, 5] } }] });
  });

  it("errori leggibili prima di chiamare il server", () => {
    expect(corpoRegole([{ ...bozzaDi(ricontatti), valori: { giorni: "3, x" } }])).toEqual({ errore: "Ricontatti dopo la proposta: scrivi i giorni separati da virgole, per esempio 3, 7, 14" });
    expect(corpoRegole([{ ...bozzaDi(sla), valori: { minuti: "", avvisoMinuti: "90" } }])).toEqual({ errore: "Prima chiamata entro: minuti deve essere un numero intero" });
  });
});

describe("link del Foglio Andrea", () => {
  const ID = "1AbC-dEf_0123456789xyz";
  it("dal link intero ricava id e gid, dal frammento o dalla query", () => {
    expect(daLinkFoglio(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456`)).toEqual({ spreadsheetId: ID, gid: "123456" });
    expect(daLinkFoglio(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=987#gid=987`)).toEqual({ spreadsheetId: ID, gid: "987" });
    expect(daLinkFoglio(`  https://docs.google.com/spreadsheets/u/1/d/${ID}/edit?usp=sharing  `)).toEqual({ spreadsheetId: ID, gid: "0" });
  });

  it("un link che non è di Google Fogli dà un messaggio in italiano", () => {
    const errore = "Questo non è il link di un Google Foglio: aprilo nel browser e copia l'indirizzo dalla barra in alto";
    expect(daLinkFoglio("https://esempio.it/foglio")).toEqual({ errore });
    expect(daLinkFoglio("ciao")).toEqual({ errore });
    expect(daLinkFoglio("https://docs.google.com/document/d/abc/edit")).toEqual({ errore });
    expect(daLinkFoglio("")).toEqual({ errore: "Incolla il link del foglio" });
  });

  it("dal salvato si ricompone il link da mostrare", () => {
    expect(linkDelFoglio({ spreadsheetId: ID, gid: "12" })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=12`);
    expect(linkDelFoglio({ spreadsheetId: "", gid: "0" })).toBe("");
  });
});
