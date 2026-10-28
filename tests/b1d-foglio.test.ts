import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { giroFoglio } from "../worker/foglio/sync";
import { createUser } from "./helpers";
import { chiaveDiProva } from "./foglio-chiave";

// Blocco 1, modifica 8: il Foglio Andrea aggancia i lead che già esistono e ne completa solo i campi vuoti,
// anche quando rilegge il foglio. La fase non si tocca mai.
const NOW = Date.UTC(2026, 9, 13, 8, 0);
const TESTATA = ["Data di creazione", "Azienda", "Nome e Cognome", "Telefono", "Email", "Campagna"];
const MAPPA = { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "" };

let foglio: string[][] = [];
const righe = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<Record<string, unknown>>().then((r) => r.results);

function fintoGoogle() {
  setGoogleFetch(async (url) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok", expires_in: 3600, token_type: "Bearer" });
    const valueRanges = new URL(url).searchParams.getAll("ranges").map((r) => {
      const [, da, a] = /!A(\d+):Z(\d+)$/.exec(r)!;
      const values = foglio.slice(Number(da) - 1, Number(a));
      while (values.length && values[values.length - 1].length === 0) values.pop();
      return { range: r, values };
    });
    return Response.json({ valueRanges });
  });
}

async function inserisci(id: string, stageId: string, campi: { phone?: string; email?: string; contactName?: string; campagna?: string }) {
  const norm = campi.phone ? campi.phone.replace(/\D/g, "").replace(/^39/, "") : null;
  await env.DB.prepare(`INSERT INTO leads (id, company, contact_name, phone, phone_norm, email, email_norm, meta_campaign, source, stage_id, stage_changed_at, lost_reason, created_at, updated_at)
    VALUES (?1, 'Azienda di prima', ?2, ?3, ?4, ?5, ?6, ?7, 'meta', ?8, 0, ?9, 0, 0)`)
    .bind(id, campi.contactName ?? null, campi.phone ?? null, norm, campi.email ?? null, campi.email?.toLowerCase() ?? null, campi.campagna ?? null, stageId,
      stageId === "non-chiuso" ? "prezzo" : null)
    .run();
}

afterEach(() => { setGoogleFetch(null); setEmailFetch(null); });

describe("Foglio Andrea: aggancio ai lead che ci sono già", () => {
  let envFoglio: Env;
  beforeEach(async () => {
    const { pem } = await chiaveDiProva();
    envFoglio = { ...env, GOOGLE_SA_EMAIL: "sa@prova.iam.gserviceaccount.com", GOOGLE_SA_PRIVATE_KEY: pem } as Env;
    await createUser();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('foglio', ?, ?)")
      .bind(JSON.stringify({ attivo: true, spreadsheetId: "foglio-finto", scheda: "Lead", mappa: MAPPA }), NOW).run();
    fintoGoogle();
    setEmailFetch(async () => Response.json({ id: "re_1" }));
  });

  it("stesso telefono di un lead aperto: niente lead nuovo, si riempiono solo i campi vuoti", async () => {
    await inserisci("aperto", "da-richiamare", { phone: "+39 333 111 2222", contactName: "Nome già scritto" });
    foglio = [TESTATA, ["2026-10-12 09:10", "Altra azienda", "Mario Rossi", "333 111 2222", "mario@rossi-finto.it", "Autunno"]];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, agganciate: 1 });
    const [l] = await righe("SELECT id, company, contact_name, email, email_norm, meta_campaign, stage_id FROM leads");
    expect(l).toEqual({ id: "aperto", company: "Azienda di prima", contact_name: "Nome già scritto", email: "mario@rossi-finto.it", email_norm: "mario@rossi-finto.it", meta_campaign: "Autunno", stage_id: "da-richiamare" });
  });

  it("lead tra i non interessati: agganciato senza cambiare fase", async () => {
    await inserisci("perso", "non-chiuso", { email: "anna@bianchi-finto.it" });
    foglio = [TESTATA, ["2026-10-12 10:00", "Bar Bianchi", "Anna Bianchi", "347 555 6666", "ANNA@bianchi-finto.it", "Autunno"]];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 0, agganciate: 1 });
    const [l] = await righe("SELECT stage_id, lost_reason, phone_norm, contact_name FROM leads");
    expect(l).toEqual({ stage_id: "non-chiuso", lost_reason: "prezzo", phone_norm: "3475556666", contact_name: "Anna Bianchi" });
  });

  it("in rilettura la riga già legata completa i campi rimasti vuoti", async () => {
    foglio = [TESTATA, ["2026-10-12 11:00", "Forno Verdi", "", "", "luca@forno-finto.it", ""]];
    expect(await giroFoglio(envFoglio, NOW)).toMatchObject({ create: 1 });
    // Il foglio cambia forma (riga inserita in cima) e la riga ora ha referente e campagna.
    foglio = [TESTATA, ["2026-10-12 10:30", "Altro Finto", "Pia", "333 000 1111", "pia@altro-finto.it", ""], ["2026-10-12 11:00", "Forno Verdi", "Luca Verdi", "348 777 8888", "luca@forno-finto.it", "Autunno"]];
    expect(await giroFoglio(envFoglio, NOW + 300_000)).toMatchObject({ riletto: true, create: 1, agganciate: 1 });
    const l = (await righe("SELECT contact_name, phone, meta_campaign, stage_id FROM leads WHERE email_norm = 'luca@forno-finto.it'"))[0];
    expect(l).toEqual({ contact_name: "Luca Verdi", phone: "+393487778888", meta_campaign: "Autunno", stage_id: "da-chiamare-prima-volta" });
  });
});
