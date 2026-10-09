import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { giro, LAVORI, limiteDi, registraLavoro, scadiProposte, type DefLavoro } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { giroFoglio } from "../worker/foglio/sync";
import { daRoma, partiRoma as partiDi } from "../worker/lib/roma";
import { setMetaFetch } from "../worker/meta/fetcher";
import { createUser } from "./helpers";

const r = (ore: number, minuti: number) => daRoma(2026, 10, 13, ore, minuti);
const GIORNO = 86_400_000;
const NOW = r(6, 0);
// Piano gratuito Workers: 50 query D1 per invocazione. Il giro deve restarne ben sotto.
const QUERY_MASSIME = 50;
const lun10 = daRoma(2026, 10, 12, 10, 0); // lunedì 12 ottobre 2026, 10:00 di Roma
const lun1005 = daRoma(2026, 10, 12, 10, 5);
const lun1015 = daRoma(2026, 10, 12, 10, 15);
const mar0600 = daRoma(2026, 10, 13, 6, 0);
// Massimi per giro dei lavori del Piano A, letti dalla definizione del giro.
const MAX = { foglio: LAVORI.foglio!.max, meta: LAVORI.meta!.max, conferme: LAVORI.conferme!.max, inviti: 2 };

async function insertLead(id: string, extra: Record<string, unknown> = {}) {
  const row = { id, company: "Officina Prova", source: "manuale", stage_id: "in-attesa-decisione", stage_changed_at: NOW, created_at: NOW, updated_at: NOW, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}
async function insertProposta(id: string, status: string, extra: Record<string, unknown> = {}) {
  const row = { id, number: `ACC-${id}`, lead_id: "l1", status, registered_via: "manuale", created_at: NOW - 40 * GIORNO, updated_at: NOW - 40 * GIORNO, ...extra };
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO proposals (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...Object.values(row)).run();
}

// Conta le query mandate a D1: ogni query (anche dentro un batch) passa da prepare.
function contaQuery(): { env: Env; n: () => number } {
  let n = 0;
  const db = new Proxy(env.DB, {
    get(t, k) {
      if (k === "prepare") return (q: string) => { n++; return t.prepare(q); };
      const v = Reflect.get(t, k);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { env: { ...env, DB: db } as Env, n: () => n };
}

// Come contaQuery, ma ricorda anche quanti parametri lega ogni query (D1 online ne accetta al massimo 100).
function contaParametri(): { env: Env; massimo: () => number } {
  let massimo = 0;
  const db = new Proxy(env.DB, {
    get(t, k) {
      if (k === "prepare") {
        return (q: string) => {
          const st = t.prepare(q);
          return new Proxy(st, {
            get(s2, k2) {
              if (k2 === "bind") return (...args: unknown[]) => { massimo = Math.max(massimo, args.length); return s2.bind(...args); };
              const v = Reflect.get(s2, k2);
              return typeof v === "function" ? v.bind(s2) : v;
            },
          });
        };
      }
      const v = Reflect.get(t, k);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { env: { ...env, DB: db } as Env, massimo: () => massimo };
}

const TESTATA_FOGLIO = "Data di creazione,Azienda,Nome e Cognome,Telefono,Email,Campagna,Id Meta";
async function foglioFinto(righe: string[]) {
  setGoogleFetch(async () => new Response([TESTATA_FOGLIO, ...righe].join("\n"), { headers: { "content-type": "text/csv" } }));
  setEmailFetch(async () => Response.json({ id: "re_1" }));
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('foglio', ?, 0)")
    .bind(JSON.stringify({ attivo: true, spreadsheetId: "foglio-finto", scheda: "", gid: "0", mappa: { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "Id Meta" } }))
    .run();
}
const rigaFoglio = (i: number) => `2026-10-12 09:${String(i % 60).padStart(2, "0")},Officina ${i},Luca Prova,+39 333 100 ${String(1000 + i)},luca${i}@esempio.it,Autunno,meta-${i}`;
const ultimaRiga = async () => (await env.DB.prepare("SELECT last_row FROM sheet_sync_state WHERE id = 'foglio-andrea'").first<{ last_row: number }>())?.last_row;
const agganciati = async () => (await env.DB.prepare("SELECT count(*) n FROM leads WHERE sheet_row_key IS NOT NULL").first<{ n: number }>())?.n;

afterEach(() => { setEmailFetch(null); setGoogleFetch(null); setMetaFetch(null); });

describe("limiteDi", () => {
  const def: DefLavoro = { quando: () => true, fisse: 4, perUnita: 6, sottoPerUnita: 1, max: 5, esegui: async () => 0 };
  it("rispetta il massimo, le query e le sottorichieste", () => {
    expect(limiteDi(def, 45, 15)).toBe(5);
    expect(limiteDi(def, 20, 15)).toBe(2); // (20-4)/6
    expect(limiteDi(def, 45, 3)).toBe(3);
    expect(limiteDi(def, 9, 15)).toBe(0);
  });
  it("un lavoro senza unità gira se bastano le fisse", () => {
    expect(limiteDi({ ...def, perUnita: 0, sottoPerUnita: 0, max: 1 }, 4, 0)).toBe(1);
    expect(limiteDi({ ...def, perUnita: 0, sottoPerUnita: 0, max: 1 }, 3, 0)).toBe(0);
  });
});

describe("calendario del giro", () => {
  const quali = (now: number) => Object.entries(LAVORI).filter(([, d]) => d!.quando(partiDi(now))).map(([k]) => k);
  it("foglio ogni 10 minuti, Meta ogni 15, proposte alle 6", async () => {
    expect(quali(lun10)).toEqual(expect.arrayContaining(["foglio", "meta", "conferme"]));
    expect(quali(lun1005)).not.toContain("foglio");
    expect(quali(lun1005)).not.toContain("meta");
    expect(quali(lun1015)).toContain("meta");
    expect(quali(lun1015)).not.toContain("foglio");
    expect(quali(mar0600)).toContain("proposte_scadute");
  });
  it("un giro partito con qualche secondo di ritardo resta lo stesso giro", () => {
    expect(quali(lun1015 + 40_000)).toContain("meta");
    expect(quali(lun1015 + 40_000)).not.toContain("foglio");
  });
  it("le 6 sono le 6 di Roma anche il giorno del cambio d'ora", () => {
    expect(quali(daRoma(2026, 10, 25, 6, 0))).toContain("proposte_scadute");
    expect(quali(daRoma(2026, 10, 25, 5, 0))).not.toContain("proposte_scadute");
  });
});

describe("giro a budget", () => {
  it("giro pieno: mai oltre 45 query, i lavori che non entrano aspettano", async () => {
    const chiamati: [string, number][] = [];
    const finto = (nome: string, query: number): DefLavoro => ({
      quando: () => true, fisse: 2, perUnita: query, sottoPerUnita: 1, max: 5,
      esegui: async (e, _n, limite) => {
        chiamati.push([nome, limite]);
        for (let i = 0; i < 2 + limite * query; i++) await e.DB.prepare("SELECT 1").first();
      },
    });
    const salvati = { ...LAVORI };
    try {
      for (const k of Object.keys(LAVORI)) delete (LAVORI as Record<string, unknown>)[k];
      registraLavoro("foglio", finto("foglio", 17));
      registraLavoro("meta", finto("meta", 13));
      registraLavoro("conferme", finto("conferme", 6));
      const r = await giro(env, lun10);
      expect(r.query).toBeLessThanOrEqual(45);
      expect(chiamati[0]).toEqual(["foglio", 2]);
      expect(r.saltati.length + r.fatti.length).toBe(3);
    } finally {
      for (const k of Object.keys(LAVORI)) delete (LAVORI as Record<string, unknown>)[k];
      Object.assign(LAVORI, salvati);
    }
  });

  it("un lavoro che lancia non ferma gli altri e il giro diventa rosso", async () => {
    const salvati = { ...LAVORI };
    try {
      for (const k of Object.keys(LAVORI)) delete (LAVORI as Record<string, unknown>)[k];
      registraLavoro("foglio", { quando: () => true, fisse: 1, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: async () => { throw new Error("foglio giù"); } });
      registraLavoro("meta", { quando: () => true, fisse: 1, perUnita: 0, sottoPerUnita: 0, max: 1, esegui: async () => 1 });
      const r = await giro(env, lun10);
      expect(r.fatti).toEqual(["meta"]);
      expect(r.errori[0]).toContain("foglio giù");
      const riga = await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'giro'").first<{ ok: number }>();
      expect(riga?.ok).toBe(0);
    } finally {
      for (const k of Object.keys(LAVORI)) delete (LAVORI as Record<string, unknown>)[k];
      Object.assign(LAVORI, salvati);
    }
  });
});

describe("proposte scadute", () => {
  it("scadono registrate e presentate oltre la validità, o 30 giorni dopo l'invio se manca; storico sul lead", async () => {
    await insertLead("l1");
    await insertProposta("a", "registrata", { valid_until: NOW - 1000, sent_at: NOW - 31 * GIORNO });
    await insertProposta("b", "presentata", { valid_until: NOW + GIORNO });
    await insertProposta("c", "accettata", { valid_until: NOW - 1000 });
    await insertProposta("d", "presentata", { valid_until: null, sent_at: NOW - 31 * GIORNO });
    await insertProposta("e", "registrata", { valid_until: null, sent_at: NOW - 29 * GIORNO });
    expect(await scadiProposte(getDb(env.DB), NOW)).toBe(2);
    const { results } = await env.DB.prepare("SELECT id, status FROM proposals ORDER BY id").all<{ id: string; status: string }>();
    expect(results.map((p) => p.status)).toEqual(["scaduta", "presentata", "accettata", "scaduta", "registrata"]);
    const storico = await env.DB.prepare("SELECT body FROM activities WHERE lead_id = 'l1' ORDER BY body").all<{ body: string }>();
    expect(storico.results.map((a) => a.body)).toEqual(["Preventivo ACC-a scaduto", "Preventivo ACC-d scaduto"]);
  });

  it("il secondo giro non trova niente", async () => {
    await insertLead("l1");
    await insertProposta("a", "registrata", { valid_until: NOW - 1000 });
    await scadiProposte(getDb(env.DB), NOW);
    expect(await scadiProposte(getDb(env.DB), NOW + 300_000)).toBe(0);
  });
});

describe("giro programmato", () => {
  it("registra la sua ora in integration_status", async () => {
    expect(await giro(env, r(10, 5))).toMatchObject({ fatti: ["conferme"], saltati: [], errori: [] });
    expect(await env.DB.prepare("SELECT ok, last_ok_at FROM integration_status WHERE key = 'giro'").first()).toEqual({ ok: 1, last_ok_at: r(10, 5) });
  });

  it("giro del foglio: al massimo 2 lead nuovi e sotto il tetto di query D1; il giro dopo riprende da dove era", async () => {
    await createUser();
    const testata = "Data di creazione,Azienda,Nome e Cognome,Telefono,Email,Campagna";
    const righe = Array.from({ length: 6 }, (_, i) => `2026-10-12 09:1${i},Officina Prova ${i},Luca Prova,+39 333 000 00${10 + i},luca${i}@esempio.it,Autunno`);
    setGoogleFetch(async () => new Response([testata, ...righe].join("\n"), { headers: { "content-type": "text/csv" } }));
    setEmailFetch(async () => Response.json({ id: "re_1" }));
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('foglio', ?, 0)")
      .bind(JSON.stringify({ attivo: true, spreadsheetId: "foglio-finto", scheda: "", gid: "0", mappa: { data: "Data di creazione", azienda: "Azienda", referente: "Nome e Cognome", telefono: "Telefono", email: "Email", campagna: "Campagna", inserzione: "", metaId: "" } }))
      .run();
    const c = contaQuery();
    const primo = await giro(c.env, r(10, 0));
    expect(primo.fatti[0]).toBe("foglio");
    expect(primo.errori).toEqual([]);
    expect(primo.query).toBeLessThanOrEqual(45);
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: MAX.foglio });
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
    await giro(env, r(10, 10));
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 2 * MAX.foglio });
    await giro(env, r(10, 20));
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 6 });
  });

  it("giro del foglio con molti agganci a lead già entrati: sotto il tetto di query, il giro dopo riprende dalla riga giusta", async () => {
    await createUser();
    // Telefoni dei lead uguali a quelli del foglio: ogni riga aggancia, nessuna crea.
    for (let i = 0; i < 50; i++) await insertLead(`l-${i}`, { phone_norm: `333100${1000 + i}` });
    await foglioFinto(Array.from({ length: 50 }, (_, i) => rigaFoglio(i)));
    const c = contaQuery();
    const primo = await giroFoglio(c.env, r(10, 0), MAX.foglio);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
    expect(primo).toMatchObject({ create: 0, ancora: true });
    const dopoPrimo = await agganciati();
    expect(dopoPrimo).toBeGreaterThan(0);
    expect(dopoPrimo).toBeLessThan(50);
    expect(await ultimaRiga()).toBe(1 + primo!.lette);
    const c2 = contaQuery();
    const secondo = await giroFoglio(c2.env, r(10, 15), MAX.foglio);
    expect(c2.n()).toBeLessThan(QUERY_MASSIME);
    expect(secondo!.riletto).toBe(false);
    expect(await agganciati()).toBe(dopoPrimo! + secondo!.agganciate);
    expect(await ultimaRiga()).toBe(1 + primo!.lette + secondo!.lette);
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 50 });
  });

  it("con 50 righe nel foglio nessuna query lega più di 100 parametri", async () => {
    await createUser();
    await foglioFinto(Array.from({ length: 50 }, (_, i) => rigaFoglio(i)));
    const c = contaParametri();
    const esito = await giroFoglio(c.env, r(10, 0), MAX.foglio);
    expect(esito!.errore).toBeUndefined();
    expect(c.massimo()).toBeGreaterThan(0);
    expect(c.massimo()).toBeLessThanOrEqual(100);
  });

  it("ancora: vero finché il foglio ha righe da leggere, falso alla fine", async () => {
    await createUser();
    await foglioFinto(Array.from({ length: 3 }, (_, i) => rigaFoglio(i)));
    expect(await giroFoglio(env, r(10, 0), 2)).toMatchObject({ create: 2, ancora: true });
    expect(await giroFoglio(env, r(10, 15), 2)).toMatchObject({ create: 1, ancora: false });
    expect(await giroFoglio(env, r(10, 30), 2)).toMatchObject({ lette: 0, ancora: false });
  });

  it("le proposte scadute si chiudono a 20 per giro, il giro dopo riprende", async () => {
    await insertLead("l1");
    for (let i = 0; i < 25; i++) await insertProposta(`p${String(i).padStart(2, "0")}`, "presentata", { sent_at: NOW - 40 * GIORNO });
    expect(await scadiProposte(getDb(env.DB), NOW)).toBe(20);
    expect(await scadiProposte(getDb(env.DB), NOW)).toBe(5);
  });

  it("giro delle conferme: cinque email ritentate e due inviti in coda restano sotto il tetto di query D1", async () => {
    for (let i = 0; i < 6; i++) await insertLead(`c${i}`, { source: "meta", email: `luca${i}@esempio.it`, confirmation_error: "Resend non raggiungibile, si riprova", confirmation_attempts: 1, created_at: r(10, 0) - i });
    // Due inviti rimasti in coda: lead con email (già confermati) e call future non ancora mandate.
    for (let i = 0; i < 2; i++) {
      await insertLead(`inv${i}`, { email: `anna${i}@esempio.it`, contact_name: "Anna Prova" });
      await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, invite_queued_at, created_at, updated_at) VALUES (?, ?, 'conoscenza', ?, ?, ?, ?)")
        .bind(`kq${i}`, `inv${i}`, r(10, 5) + 2 * GIORNO, NOW, NOW, NOW).run();
    }
    let inviate = 0;
    setEmailFetch(async () => { inviate++; return Response.json({ id: `re_${inviate}` }); });
    const c = contaQuery();
    const esito = await giro(c.env, r(10, 5));
    expect(esito).toMatchObject({ fatti: ["conferme"], errori: [] });
    expect(esito.query).toBeLessThanOrEqual(45);
    expect(inviate).toBe(MAX.conferme + MAX.inviti);
    const svuotata = await env.DB.prepare("SELECT COUNT(*) AS n FROM calls WHERE invite_sent_at IS NOT NULL").first<{ n: number }>();
    expect(svuotata?.n).toBe(2);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
  });

  it("giro di Meta: al massimo 2 lead completati e sotto il tetto di query D1", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) await insertLead(`m${i}`, { source: "meta", meta_lead_id: `lg-${i}`, meta_status: "pending", meta_attempts: 0, stage_id: "da-chiamare-prima-volta" });
    let chiamate = 0;
    setMetaFetch(async () => { chiamate++; return Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: [`anna${chiamate}@esempio.it`] }, { name: "company_name", values: ["Bar Prova"] }] }); });
    setEmailFetch(async () => Response.json({ id: "re_1" }));
    const c = contaQuery();
    // Due lead da Meta (31 query) lasciano alle conferme il residuo: ne entra una, il resto al giro dopo.
    const esito = await giro(c.env, r(10, 15));
    expect(esito).toMatchObject({ fatti: ["meta", "conferme"], saltati: [], errori: [] });
    expect(esito.query).toBeLessThanOrEqual(45);
    expect(chiamate).toBe(MAX.meta);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
  });

  it("un lavoro che fallisce rende rosso il giro con l'errore", async () => {
    const rotto = { ...env, DB: new Proxy(env.DB, { get(t, k) { if (k === "prepare") return (q: string) => (q.includes("proposals") ? (() => { throw new Error("D1 finto rotto"); })() : t.prepare(q)); const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } }) } as Env;
    const esito = await giro(rotto, r(6, 0));
    expect(esito.errori[0]).toMatch(/^proposte_scadute: /);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'giro'").first()).toEqual({ ok: 0 });
  });
});
