import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { leggiCsv, parseCsv } from "../worker/foglio/leggi";
import { anteprimaFoglio, giroFoglio } from "../worker/foglio/sync";
import { createUser } from "./helpers";
import { chiaveDiProva } from "./foglio-chiave";

const NOW = Date.UTC(2026, 9, 13, 8, 0);
const TESTATA = ["Data di creazione", "Azienda", "Nome e Cognome", "Telefono", "Email", "Campagna", "Quanti dipendenti?"];
const ROSSI = ["2026-10-12 09:10", "Officina Rossi Finta", "Mario Rossi", "333 111 2222", "mario@officina-rossi-finta.it", "Autunno", "Più di 10"];
const PROVA = ["2026-10-12 09:20", "Test lead", "Test lead", "", "test@prova.it", "Autunno", ""];
const BIANCHI = ["2026-10-12 10:00", "Bar Bianchi Finto", "Anna Bianchi", "+39 347 555 6666", "anna@bar-bianchi-finto.it", "Autunno", "Meno di 5"];
const VERDI = ["2026-10-13 07:40", "Forno Verdi Finto", "Luca Verdi", "348 777 8888", "luca@forno-verdi-finto.it", "Autunno", "Da 5 a 10"];
const MAPPA = { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "" };

let foglio: string[][] = [];
let chiamate: string[] = [];
let googleRotto = false;
let email = 0;

function fintoGoogle() {
  setGoogleFetch(async (url) => {
    chiamate.push(url);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok-prova", expires_in: 3600, token_type: "Bearer" });
    if (googleRotto) return Response.json({ error: { message: "Errore finto di Google" } }, { status: 500 });
    const valueRanges = new URL(url).searchParams.getAll("ranges").map((r) => {
      const [, da, a] = /!A(\d+):Z(\d+)$/.exec(r)!;
      const values = foglio.slice(Number(da) - 1, Number(a));
      while (values.length && values[values.length - 1].length === 0) values.pop();
      return { range: r, values };
    });
    return Response.json({ valueRanges });
  });
}

async function scriviImpostazioni(foglioImp: Record<string, unknown>) {
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('foglio', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(foglioImp), NOW).run();
}

const lead = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Record<string, unknown>>().then((r) => r.results);
const stato = () => env.DB.prepare("SELECT last_row, last_run FROM sheet_sync_state WHERE id = 'foglio-andrea'").first<{ last_row: number; last_run: string }>();
const statoIntegrazione = () => env.DB.prepare("SELECT ok, last_error FROM integration_status WHERE key = 'foglio'").first();

afterEach(() => { setGoogleFetch(null); setEmailFetch(null); });

describe("Foglio Andrea con l'account di servizio", () => {
  let envFoglio: Env;
  beforeEach(async () => {
    const { pem } = await chiaveDiProva();
    envFoglio = { ...env, GOOGLE_SA_EMAIL: "sa@prova.iam.gserviceaccount.com", GOOGLE_SA_PRIVATE_KEY: pem } as Env;
    await createUser();
    await scriviImpostazioni({ attivo: true, spreadsheetId: "foglio-finto", scheda: "Lead", mappa: MAPPA });
    foglio = [TESTATA, ROSSI, PROVA, [], BIANCHI];
    chiamate = []; googleRotto = false; email = 0;
    fintoGoogle();
    setEmailFetch(async () => { email++; return Response.json({ id: `re_${email}` }); });
  });

  it("crea i lead delle righe nuove, scarta la riga di prova e quella vuota, parte la catena", async () => {
    expect(await giroFoglio(envFoglio, NOW)).toEqual({ lette: 4, create: 2, agganciate: 0, scartate: 2, riletto: false });
    const nuovi = await lead("SELECT company, phone, source, meta_campaign, owner_id, score, meta_answers FROM leads ORDER BY company");
    expect(nuovi.map((l) => l.company)).toEqual(["Bar Bianchi Finto", "Officina Rossi Finta"]);
    expect(nuovi[1]).toMatchObject({ phone: "+393331112222", source: "foglio_andrea", meta_campaign: "Autunno", owner_id: "tommaso" });
    expect(nuovi[1].score).not.toBeNull();
    expect(JSON.parse(String(nuovi[1].meta_answers))).toEqual({ "Quanti dipendenti?": "Più di 10" });
    expect((await stato())?.last_row).toBe(5);
    expect(email).toBe(2);
    expect(chiamate.some((u) => u.startsWith("https://sheets.googleapis.com/v4/spreadsheets/foglio-finto/values:batchGet?"))).toBe(true);
    expect(chiamate.some((u) => u.includes("docs.google.com"))).toBe(false);
  });

  it("il giro dopo non rilegge niente e non rifirma il token", async () => {
    await giroFoglio(envFoglio, NOW);
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toEqual({ lette: 0, create: 0, agganciate: 0, scartate: 0, riletto: false });
    expect(chiamate.filter((u) => u.includes("oauth2")).length).toBe(1);
    expect((await lead("SELECT id FROM leads")).length).toBe(2);
  });

  it("doppione per telefono scritto diverso: niente lead nuovo, storico sul lead di Meta, nessuna seconda email", async () => {
    await env.DB.prepare("INSERT INTO leads (id, company, phone, phone_norm, source, stage_id, stage_changed_at, confirmation_sent_at, created_at, updated_at) VALUES ('meta1', 'Officina Rossi Finta', '+393331112222', '3331112222', 'meta', 'da-chiamare-prima-volta', ?, ?, ?, ?)").bind(NOW, NOW, NOW, NOW).run();
    foglio = [TESTATA, ["2026-10-12 09:10", "Officina Rossi Finta", "Mario Rossi", "0039 333-111.2222", "mario@officina-rossi-finta.it", "Autunno", ""]];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, agganciate: 1 });
    expect((await lead("SELECT id FROM leads")).length).toBe(1);
    expect((await lead("SELECT sheet_row_key FROM leads WHERE id = 'meta1'"))[0].sheet_row_key).toMatch(/^[0-9a-f]{64}$/);
    expect((await lead("SELECT body FROM activities WHERE lead_id = 'meta1' AND type = 'foglio'"))[0].body).toBe("Visto anche nel Foglio Andrea");
    expect(email).toBe(0);
  });

  it("doppione per email (maiuscole diverse) e per id Meta", async () => {
    await env.DB.prepare("INSERT INTO leads (id, company, email, email_norm, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('m2', 'Bar Bianchi Finto', 'anna@bar-bianchi-finto.it', 'anna@bar-bianchi-finto.it', 'meta', 'da-chiamare-prima-volta', ?, ?, ?)").bind(NOW, NOW, NOW).run();
    await env.DB.prepare("INSERT INTO leads (id, company, meta_lead_id, source, stage_id, stage_changed_at, created_at, updated_at) VALUES ('m3', 'Forno Verdi Finto', 'lg-99', 'meta', 'da-chiamare-prima-volta', ?, ?, ?)").bind(NOW, NOW, NOW).run();
    await scriviImpostazioni({ attivo: true, spreadsheetId: "foglio-finto", scheda: "Lead", mappa: { ...MAPPA, metaId: "Id lead" } });
    foglio = [[...TESTATA, "Id lead"], [...BIANCHI.slice(0, 4), "Anna@Bar-Bianchi-Finto.it", "Autunno", "", ""], [...VERDI.slice(0, 3), "", "", "Autunno", "", "lg-99"]];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, agganciate: 2 });
    expect((await lead("SELECT id FROM leads")).length).toBe(2);
  });

  it("foglio riordinato o con righe cancellate: rilegge una volta, nessun doppione, riparte dal nuovo fondo", async () => {
    await giroFoglio(envFoglio, NOW);
    foglio = [TESTATA, BIANCHI, ROSSI, VERDI];
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toMatchObject({ create: 1, riletto: true });
    expect((await lead("SELECT company FROM leads ORDER BY company")).map((l) => l.company)).toEqual(["Bar Bianchi Finto", "Forno Verdi Finto", "Officina Rossi Finta"]);
    expect((await stato())?.last_row).toBe(4);
  });

  it("intestazione cambiata: nessun lead, stato rosso con la colonna mancante, il giro dopo riprova", async () => {
    foglio = [["Data di creazione", "Azienda", "Nome e Cognome", "Cellulare", "Email", "Campagna"], ROSSI.slice(0, 6)];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, errore: "Colonna Telefono non trovata" });
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
    expect(await statoIntegrazione()).toEqual({ ok: 0, last_error: "Colonna Telefono non trovata" });
    expect((await stato())?.last_row).toBe(1);
    foglio = [TESTATA, ROSSI];
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toMatchObject({ create: 1 });
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'foglio'").first()).toEqual({ ok: 1 });
  });

  it("errore di Google: stato rosso, nessun lead, ultima riga ferma", async () => {
    googleRotto = true;
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, errore: "Google 500: Errore finto di Google" });
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
    expect((await stato())?.last_row).toBe(1);
  });

  it("lead cestinato e foglio riordinato: nessun lead nuovo, nessuna email", async () => {
    const SOLO_NOME = ["2026-10-12 11:00", "Pizzeria Solo Nome Finta", "Gino Finto", "", "", "Autunno", ""];
    foglio = [TESTATA, ROSSI, BIANCHI, SOLO_NOME];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 3 });
    expect(email).toBe(2);
    await env.DB.prepare("UPDATE leads SET deleted_at = ? WHERE company = 'Officina Rossi Finta'").bind(NOW).run();
    foglio = [TESTATA, SOLO_NOME, BIANCHI, ROSSI];
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toEqual({ lette: 3, create: 0, agganciate: 3, scartate: 0, riletto: true });
    expect((await lead("SELECT id FROM leads")).length).toBe(3);
    expect((await lead("SELECT id FROM activities WHERE type = 'foglio'")).length).toBe(0);
    expect(email).toBe(2);
  });

  it("al massimo 10 lead nuovi per giro: ultima riga sulla decima, il giro dopo crea gli altri 2", async () => {
    const riga = (n: number) => [`2026-10-12 12:${String(n).padStart(2, "0")}`, `Officina Prova ${n}`, `Referente ${n}`, `+39 333 000 00${String(n).padStart(2, "0")}`, `prova${n}@esempio.it`, "Autunno", ""];
    foglio = [TESTATA, ...Array.from({ length: 12 }, (_, i) => riga(i + 1))];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ lette: 10, create: 10 });
    expect((await stato())?.last_row).toBe(11);
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toMatchObject({ lette: 2, create: 2, riletto: false });
    expect((await stato())?.last_row).toBe(13);
    expect((await lead("SELECT id FROM leads")).length).toBe(12);
  });

  it("al massimo 50 righe guardate per giro", async () => {
    foglio = [TESTATA, ...Array.from({ length: 60 }, (_, i) => [`2026-10-12 13:${String(i).padStart(2, "0")}`, "Test lead", "Test lead", "", `test${i}@esempio.it`, "Autunno", ""])];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ lette: 50, scartate: 50, create: 0 });
    expect((await stato())?.last_row).toBe(51);
    expect(await giroFoglio(envFoglio, NOW + 600_000)).toMatchObject({ lette: 10, riletto: false });
  });

  it("errori dell'account di servizio in italiano: 403, 401, rete", async () => {
    setGoogleFetch(async (url) => url.startsWith("https://oauth2") ? Response.json({ access_token: "tok-prova" }) : Response.json({ error: { message: "The caller does not have permission" } }, { status: 403 }));
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ errore: "Foglio non condiviso con l'email dell'account di servizio" });
    setGoogleFetch(async (url) => url.startsWith("https://oauth2") ? Response.json({ access_token: "tok-prova" }) : Response.json({ error: { message: "Request had invalid authentication credentials" } }, { status: 401 }));
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ errore: "Credenziali dell'account di servizio non valide" });
    await env.DB.prepare("UPDATE sheet_sync_state SET token_cache = NULL").run();
    setGoogleFetch(async () => Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 }));
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ errore: "Credenziali dell'account di servizio non valide" });
    setGoogleFetch(async () => { throw new TypeError("Network connection lost"); });
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ errore: "Google non raggiungibile, si riprova" });
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
  });

  it("la catena che fallisce su un lead non ferma gli altri", async () => {
    // Un trigger finto fa fallire la catena (assegnazione e punteggio) solo per il primo lead.
    await env.DB.prepare("CREATE TRIGGER catena_rotta BEFORE UPDATE OF score ON leads WHEN NEW.company = 'Officina Rossi Finta' BEGIN SELECT RAISE(ABORT, 'catena rotta'); END").run();
    try {
      expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 2 });
      expect((await lead("SELECT owner_id FROM leads WHERE company = 'Bar Bianchi Finto'"))[0].owner_id).toBe("tommaso");
      expect((await stato())?.last_row).toBe(5);
    } finally {
      await env.DB.prepare("DROP TRIGGER catena_rotta").run();
    }
  });

  it("lettura spenta: niente chiamate a Google", async () => {
    await env.DB.prepare("UPDATE settings SET value = json_set(value, '$.attivo', json('false')) WHERE key = 'foglio'").run();
    expect(await giroFoglio(envFoglio, NOW)).toBeNull();
    expect(chiamate).toHaveLength(0);
  });

  it("anteprima della mappa sulle prime dieci righe, senza scrivere niente", async () => {
    const a = await anteprimaFoglio(envFoglio, NOW);
    expect(a.colonneMancanti).toEqual([]);
    expect(a.righe.map((r) => [r.riga, r.azienda, r.telefono, r.scartata])).toEqual([
      [2, "Officina Rossi Finta", "+393331112222", null],
      [3, "Test lead", null, "riga di prova"],
      [4, "", null, "riga vuota"],
      [5, "Bar Bianchi Finto", "+393475556666", null],
    ]);
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
  });
});

// Via principale: il foglio condiviso "chiunque abbia il link" letto come CSV, senza credenziali.
const CSV_TESTATA = `"Data di creazione","Azienda","Nome e Cognome","Telefono","Email","Campagna","Note"`;
const CSV_ROSSI = `"2026-10-12 09:10","Officina Rossi Finta, S.r.l.","Mario Rossi","333 111 2222","mario@officina-rossi-finta.it","Autunno","Dice ""chiamatemi"" dopo le 18\r\ngrazie"`;
const CSV_PROVA = `"2026-10-12 09:20","Test lead","Test lead","","test@prova.it","Autunno",""`;
const CSV_BIANCHI = `"2026-10-12 10:00","Bar Bianchi Finto","Anna Bianchi","+39 347 555 6666","anna@bar-bianchi-finto.it","Autunno",""`;
const CSV_VERDI = `"2026-10-13 07:40","Forno Verdi Finto","Luca Verdi","348 777 8888","luca@forno-verdi-finto.it","Autunno",""`;
const URL_CSV = "https://docs.google.com/spreadsheets/d/foglio-finto/export?format=csv&gid=123456";

describe("Foglio Andrea letto come CSV (foglio condiviso con il link)", () => {
  let csv = "";
  let risposta: () => Response;
  beforeEach(async () => {
    await createUser();
    await scriviImpostazioni({ attivo: true, spreadsheetId: "foglio-finto", scheda: "Lead Autunno", gid: "123456", mappa: MAPPA });
    csv = [CSV_TESTATA, CSV_ROSSI, CSV_PROVA, CSV_BIANCHI].join("\r\n") + "\r\n";
    risposta = () => new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8" } });
    chiamate = []; email = 0;
    setGoogleFetch(async (url) => { chiamate.push(url); return risposta(); });
    setEmailFetch(async () => { email++; return Response.json({ id: `re_${email}` }); });
  });

  it("senza account di servizio legge il CSV del link, con virgole, virgolette e a capo nelle celle", async () => {
    expect(await giroFoglio(env, NOW)).toEqual({ lette: 3, create: 2, agganciate: 0, scartate: 1, riletto: false });
    expect(chiamate).toEqual([URL_CSV]);
    const nuovi = await lead("SELECT company, phone, source, sheet_row_key, meta_answers FROM leads ORDER BY company");
    expect(nuovi.map((l) => l.company)).toEqual(["Bar Bianchi Finto", "Officina Rossi Finta, S.r.l."]);
    expect(nuovi[1]).toMatchObject({ phone: "+393331112222", source: "foglio_andrea" });
    expect(nuovi[1].sheet_row_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(String(nuovi[1].meta_answers))).toEqual({ Note: 'Dice "chiamatemi" dopo le 18\r\ngrazie' });
    expect((await stato())?.last_row).toBe(4);
    expect(await statoIntegrazione()).toMatchObject({ ok: 1 });
    expect(email).toBe(2);
  });

  it("il giro dopo salta le righe già importate e prende solo quella aggiunta in fondo", async () => {
    await giroFoglio(env, NOW);
    expect(await giroFoglio(env, NOW + 600_000)).toEqual({ lette: 0, create: 0, agganciate: 0, scartate: 0, riletto: false });
    csv += CSV_VERDI + "\r\n";
    expect(await giroFoglio(env, NOW + 1_200_000)).toEqual({ lette: 1, create: 1, agganciate: 0, scartate: 0, riletto: false });
    expect((await lead("SELECT id FROM leads")).length).toBe(3);
    expect((await stato())?.last_row).toBe(5);
  });

  it("CSV riordinato: rilegge una volta senza doppioni", async () => {
    await giroFoglio(env, NOW);
    csv = [CSV_TESTATA, CSV_VERDI, CSV_BIANCHI].join("\n");
    expect(await giroFoglio(env, NOW + 600_000)).toMatchObject({ create: 1, agganciate: 1, riletto: true });
    expect((await lead("SELECT id FROM leads")).length).toBe(3);
  });

  it("foglio non condiviso (Google risponde con la pagina di accesso): errore leggibile, nessun lead", async () => {
    risposta = () => new Response("<!DOCTYPE html><html><body>Accedi</body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });
    const esito = await giroFoglio(env, NOW);
    expect(esito).toMatchObject({ create: 0, errore: "Il foglio non è condiviso con chiunque abbia il link" });
    expect(await statoIntegrazione()).toEqual({ ok: 0, last_error: "Il foglio non è condiviso con chiunque abbia il link" });
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
    expect((await stato())?.last_row).toBe(1);
  });

  it("gid sbagliato (codice diverso da 200): errore leggibile, mai un crash", async () => {
    risposta = () => new Response("Bad request", { status: 400 });
    expect(await giroFoglio(env, NOW)).toMatchObject({ errore: "Scheda non trovata: controlla il gid nel link del foglio" });
    risposta = () => new Response("Not found", { status: 404 });
    expect(await giroFoglio(env, NOW)).toMatchObject({ errore: "Scheda non trovata: controlla il gid nel link del foglio" });
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
  });

  it("Google non raggiungibile (il fetch lancia): errore leggibile, il testo tecnico solo nel log", async () => {
    setGoogleFetch(async () => { throw new TypeError("Network connection lost"); });
    expect(await giroFoglio(env, NOW)).toMatchObject({ create: 0, errore: "Google non raggiungibile, si riprova" });
    expect(await statoIntegrazione()).toEqual({ ok: 0, last_error: "Google non raggiungibile, si riprova" });
    expect((await stato())?.last_row).toBe(1);
  });

  it("senza gid nelle impostazioni usa la prima scheda (gid 0)", async () => {
    await scriviImpostazioni({ attivo: true, spreadsheetId: "foglio-finto", scheda: "", mappa: MAPPA });
    await giroFoglio(env, NOW);
    expect(chiamate).toEqual(["https://docs.google.com/spreadsheets/d/foglio-finto/export?format=csv&gid=0"]);
  });

  it("senza id del foglio: nessuna chiamata, nessun errore, integrazione non collegata", async () => {
    await scriviImpostazioni({ attivo: true, spreadsheetId: "", scheda: "", mappa: MAPPA });
    expect(await giroFoglio(env, NOW)).toBeNull();
    expect(chiamate).toHaveLength(0);
    expect(await statoIntegrazione()).toBeNull();
  });

  it("anteprima dal CSV, senza scrivere niente", async () => {
    const a = await anteprimaFoglio(env, NOW);
    expect(a.colonneMancanti).toEqual([]);
    expect(a.righe.map((r) => [r.riga, r.azienda, r.scartata])).toEqual([
      [2, "Officina Rossi Finta, S.r.l.", null],
      [3, "Test lead", "riga di prova"],
      [4, "Bar Bianchi Finto", null],
    ]);
    expect((await lead("SELECT id FROM leads")).length).toBe(0);
    expect(await statoIntegrazione()).toBeNull();
  });

  it("leggiCsv toglie il BOM iniziale", async () => {
    csv = "﻿" + csv;
    expect((await leggiCsv("foglio-finto", "123456"))[0][0]).toBe("Data di creazione");
  });
});

describe("parseCsv", () => {
  it("celle tra virgolette con virgole, virgolette raddoppiate e a capo", () => {
    expect(parseCsv('a,"b,c","d ""e"" f"\n"riga\ndue",,x\r\n')).toEqual([["a", "b,c", 'd "e" f'], ["riga\ndue", "", "x"]]);
  });
  it("ultima riga senza a capo, righe vuote e cella vuota tra virgolette", () => {
    expect(parseCsv('"",y\n\nz')).toEqual([["", "y"], [""], ["z"]]);
  });
  it("testo vuoto: nessuna riga", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
