import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { LIMITI, giro, lavoriDelGiro, scadiProposte } from "../worker/cron";
import { getDb } from "../worker/db/client";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { giroFoglio } from "../worker/foglio/sync";
import { daRoma } from "../worker/lib/roma";
import { setMetaFetch } from "../worker/meta/fetcher";
import { createUser } from "./helpers";

const r = (ore: number, minuti: number) => daRoma(2026, 10, 13, ore, minuti);
const GIORNO = 86_400_000;
const NOW = r(6, 0);
// Piano gratuito Workers: 50 query D1 per invocazione. Il giro deve restarne ben sotto.
const QUERY_MASSIME = 50;

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

describe("smistatore del cron", () => {
  it("un lavoro pesante per giro, a rotazione ogni 15 minuti: foglio, conferme, Meta", () => {
    expect(lavoriDelGiro(r(10, 0))).toEqual(["foglio"]);
    expect(lavoriDelGiro(r(10, 5))).toEqual(["conferme"]);
    expect(lavoriDelGiro(r(10, 10))).toEqual(["meta"]);
    expect(lavoriDelGiro(r(10, 15))).toEqual(["foglio"]);
    expect(lavoriDelGiro(r(10, 50))).toEqual(["conferme"]);
    expect(lavoriDelGiro(r(10, 55))).toEqual(["meta"]);
  });

  it("foglio e conferme non girano mai nella stessa invocazione", () => {
    for (let m = 0; m < 24 * 60; m += 5) {
      const l = lavoriDelGiro(r(Math.floor(m / 60), m % 60));
      expect(l).toHaveLength(1);
    }
  });

  it("alle 6 di Roma le proposte scadute prendono il posto del foglio", () => {
    expect(lavoriDelGiro(r(6, 0))).toEqual(["proposte_scadute"]);
    expect(lavoriDelGiro(r(6, 5))).toEqual(["conferme"]);
    expect(lavoriDelGiro(r(6, 15))).toEqual(["foglio"]);
  });

  it("un giro partito con qualche secondo di ritardo resta lo stesso giro", () => {
    expect(lavoriDelGiro(r(10, 10) + 40_000)).toEqual(["meta"]);
  });

  it("le 6 sono le 6 di Roma anche il giorno del cambio d'ora", () => {
    expect(lavoriDelGiro(daRoma(2026, 10, 25, 6, 0))).toContain("proposte_scadute");
    expect(lavoriDelGiro(daRoma(2026, 10, 25, 5, 0))).not.toContain("proposte_scadute");
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
    expect(await giro(env, r(10, 5))).toEqual({ fatti: ["conferme"], errori: [] });
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
    expect(await giro(c.env, r(10, 0))).toEqual({ fatti: ["foglio"], errori: [] });
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: LIMITI.foglio });
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
    await giro(env, r(10, 15));
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 2 * LIMITI.foglio });
    await giro(env, r(10, 30));
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 6 });
  });

  it("giro del foglio con molti agganci a lead già entrati: sotto il tetto di query, il giro dopo riprende dalla riga giusta", async () => {
    await createUser();
    // Telefoni dei lead uguali a quelli del foglio: ogni riga aggancia, nessuna crea.
    for (let i = 0; i < 50; i++) await insertLead(`l-${i}`, { phone_norm: `333100${1000 + i}` });
    await foglioFinto(Array.from({ length: 50 }, (_, i) => rigaFoglio(i)));
    const c = contaQuery();
    const primo = await giroFoglio(c.env, r(10, 0), LIMITI.foglio);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
    expect(primo).toMatchObject({ create: 0, ancora: true });
    const dopoPrimo = await agganciati();
    expect(dopoPrimo).toBeGreaterThan(0);
    expect(dopoPrimo).toBeLessThan(50);
    expect(await ultimaRiga()).toBe(1 + primo!.lette);
    const c2 = contaQuery();
    const secondo = await giroFoglio(c2.env, r(10, 15), LIMITI.foglio);
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
    const esito = await giroFoglio(c.env, r(10, 0), LIMITI.foglio);
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
    expect(await giro(c.env, r(10, 5))).toEqual({ fatti: ["conferme"], errori: [] });
    expect(inviate).toBe(LIMITI.conferme + LIMITI.inviti);
    const svuotata = await env.DB.prepare("SELECT COUNT(*) AS n FROM calls WHERE invite_sent_at IS NOT NULL").first<{ n: number }>();
    expect(svuotata?.n).toBe(2);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
  });

  it("giro di Meta: al massimo 3 lead completati e sotto il tetto di query D1", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) await insertLead(`m${i}`, { source: "meta", meta_lead_id: `lg-${i}`, meta_status: "pending", meta_attempts: 0, stage_id: "da-chiamare-prima-volta" });
    let chiamate = 0;
    setMetaFetch(async () => { chiamate++; return Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: [`anna${chiamate}@esempio.it`] }, { name: "company_name", values: ["Bar Prova"] }] }); });
    setEmailFetch(async () => Response.json({ id: "re_1" }));
    const c = contaQuery();
    expect(await giro(c.env, r(10, 10))).toEqual({ fatti: ["meta"], errori: [] });
    expect(chiamate).toBe(LIMITI.meta);
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
  });

  it("un lavoro che fallisce rende rosso il giro con l'errore", async () => {
    const rotto = { ...env, DB: new Proxy(env.DB, { get(t, k) { if (k === "prepare") return (q: string) => (q.includes("proposals") ? (() => { throw new Error("D1 finto rotto"); })() : t.prepare(q)); const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } }) } as Env;
    const esito = await giro(rotto, r(6, 0));
    expect(esito.errori[0]).toMatch(/^proposte_scadute: /);
    expect(await env.DB.prepare("SELECT ok FROM integration_status WHERE key = 'giro'").first()).toEqual({ ok: 0 });
  });
});
