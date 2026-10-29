import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { giro, LAVORI, limiteDi, registraLavoro, scadiProposte, type DefLavoro } from "../worker/cron";
import { controllaAvvisi } from "../worker/avvisi/controlli";
import { getDb } from "../worker/db/client";
import { setEmailFetch } from "../worker/email/fetcher";
import type { Env } from "../worker/env";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { giroFoglio } from "../worker/foglio/sync";
import { daRoma, partiRoma as partiDi } from "../worker/lib/roma";
import { setMetaFetch } from "../worker/meta/fetcher";
import { b64u } from "../worker/push/cifra";
import { setPushFetch } from "../worker/push/fetcher";
import { setTelegramFetch } from "../worker/telegram/fetcher";
import { chiamaClaude } from "../worker/claude/client";
import { accoda, AVVIO_MAX_MS, lavoraCoda, registraTipo, setOrologioCoda, TIPI } from "../worker/claude/coda";
import { setClaudeFetch } from "../worker/claude/fetcher";
import { contaD1 } from "../worker/lib/bilancio";
import { rispostaClaude } from "./claude-fixture";
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

afterEach(() => { setEmailFetch(null); setGoogleFetch(null); setMetaFetch(null); setPushFetch(null); setTelegramFetch(null); setClaudeFetch(null); });

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
  it("foglio a ogni giro tranne le 6, Meta ogni 15, proposte alle 6", async () => {
    expect(quali(lun10)).toEqual(expect.arrayContaining(["foglio", "meta", "conferme"]));
    expect(quali(lun1005)).toContain("foglio");
    expect(quali(lun1005)).not.toContain("meta");
    expect(quali(lun1015)).toContain("meta");
    expect(quali(lun1015)).toContain("foglio");
    expect(quali(mar0600)).toContain("proposte_scadute");
    expect(quali(mar0600)).not.toContain("foglio");
  });
  it("ordine del giro: i canali (push e Telegram) dopo gli avvisi, prima delle conferme; le task ricorrenti dopo Meta 48 ore; il lunedì prima di Claude; Claude per ultimo", () => {
    expect(Object.keys(LAVORI)).toEqual(["proposte_scadute", "foglio", "meta_recupero", "meta", "avvisi", "risponditore", "ig_token", "consegna", "telegram", "conferme", "meta_48h", "lavori", "cestino", "documenti", "lunedi", "stato", "claude"]);
  });
  it("un giro partito con qualche secondo di ritardo resta lo stesso giro", () => {
    expect(quali(lun1015 + 40_000)).toContain("meta");
  });
  it("le task ricorrenti dei lavori girano alle 7:00 e alle 7:30 di Roma, non alle 7:05", () => {
    expect(quali(r(7, 0))).toContain("lavori");
    expect(quali(r(7, 30) + 40_000)).toContain("lavori");
    expect(quali(r(7, 5))).not.toContain("lavori");
    expect(quali(r(8, 0))).not.toContain("lavori");
  });
  it("il cestino si svuota dei lead oltre 30 giorni una volta al giorno, alle 6:30 di Roma", () => {
    expect(quali(r(6, 30))).toContain("cestino");
    expect(quali(r(6, 0))).not.toContain("cestino");
    expect(quali(r(6, 35))).not.toContain("cestino");
    expect(quali(r(6, 40))).toContain("documenti");
    expect(quali(r(6, 30))).not.toContain("documenti");
    expect(quali(r(6, 45))).not.toContain("documenti");
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
    expect(await giro(env, r(10, 5))).toMatchObject({ fatti: ["foglio", "avvisi", "consegna", "telegram", "conferme", "claude"], saltati: [], errori: [] });
    expect(await env.DB.prepare("SELECT ok, last_ok_at FROM integration_status WHERE key = 'giro'").first()).toEqual({ ok: 1, last_ok_at: r(10, 5) });
  });

  it("giro del foglio: 1 lead per giro quando le conferme sono in programma, sotto il tetto di query D1; il giro dopo riprende da dove era", async () => {
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
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 1 });
    expect(c.n()).toBeLessThan(QUERY_MASSIME);
    await giro(env, r(10, 5));
    expect(await env.DB.prepare("SELECT count(*) n FROM leads").first()).toEqual({ n: 2 });
    for (const m of [10, 15, 20, 25]) await giro(env, r(10, m));
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

  it("giro delle conferme: conferme e inviti si dividono lo stesso limite e restano sotto il tetto di query D1", async () => {
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
    expect(esito).toMatchObject({ fatti: ["foglio", "avvisi", "consegna", "telegram", "conferme"], errori: [] });
    expect(esito.query).toBeLessThanOrEqual(45);
    // Foglio spento (1 query), avvisi senza niente da dire (8): alle conferme restano 35 query, cioè 4 unità:
    // 2 conferme e 2 inviti.
    expect(inviate).toBe(4);
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
    // Foglio spento (1 query), recupero Meta spento (senza id della Pagina, 0 query), due lead da Meta (33, con la catena:
    // il giro passa la sua ora a fillMetaLead), avvisi (8 più i 2 SLA scaduti dei due lead): restano 0 query. Gli altri
    // lavori aspettano il giro dopo. Il totale resta sotto le 45.
    const esito = await giro(c.env, r(10, 15));
    expect(esito).toMatchObject({ fatti: ["foglio", "meta_recupero", "meta", "avvisi"], saltati: ["risponditore", "consegna", "telegram", "conferme", "stato", "claude"], errori: [] });
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

describe("giro con i lavori veri insieme", () => {
  // Tutto in attesa: righe nuove nel foglio, lead Meta da completare, conferme in errore, inviti in coda,
  // proposte scadute. Conta ogni prepare (riga "giro" compresa) e ogni sottorichiesta verso l'esterno.
  async function prepara(righeFoglio: number, conProposte = false) {
    await createUser();
    await foglioFinto(Array.from({ length: righeFoglio }, (_, i) => rigaFoglio(i)));
    for (let i = 0; i < 3; i++) await insertLead(`m${i}`, { source: "meta", meta_lead_id: `lg-${i}`, meta_status: "pending", meta_attempts: 0, stage_id: "da-chiamare-prima-volta" });
    for (let i = 0; i < 6; i++) await insertLead(`c${i}`, { source: "meta", email: `conf${i}@esempio.it`, confirmation_error: "Resend non raggiungibile, si riprova", confirmation_attempts: 1, created_at: r(10, 0) - i });
    for (let i = 0; i < 2; i++) {
      await insertLead(`inv${i}`, { email: `anna${i}@esempio.it`, contact_name: "Anna Prova" });
      await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, invite_queued_at, created_at, updated_at) VALUES (?, ?, 'conoscenza', ?, ?, ?, ?)")
        .bind(`kq${i}`, `inv${i}`, r(10, 0) + 2 * GIORNO, NOW, NOW, NOW).run();
    }
    if (conProposte) {
      await insertLead("l1");
      for (let i = 0; i < 25; i++) await insertProposta(`p${String(i).padStart(2, "0")}`, "presentata", { sent_at: NOW - 40 * GIORNO });
    }
    let sotto = 0;
    const google = async () => { sotto++; return new Response([TESTATA_FOGLIO, ...Array.from({ length: righeFoglio }, (_, i) => rigaFoglio(i))].join("\n"), { headers: { "content-type": "text/csv" } }); };
    setGoogleFetch(google);
    setEmailFetch(async () => { sotto++; return Response.json({ id: `re_${sotto}` }); });
    setMetaFetch(async () => { sotto++; return Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: [`meta${sotto}@esempio.it`] }, { name: "company_name", values: ["Bar Prova"] }] }); });
    let push = 0;
    setPushFetch(async () => { sotto++; push++; return new Response("", { status: 201 }); });
    return { sotto: () => sotto, push: () => push };
  }

  const casi: [string, number, number, boolean][] = [
    ["10:00, 2 lead dal foglio, Meta, conferme", r(10, 0), 2, false],
    ["10:05, foglio e conferme", r(10, 5), 2, false],
    ["10:10, 1 lead dal foglio, 6 conferme in errore, 2 inviti", r(10, 10), 1, false],
    ["10:15, foglio, Meta e conferme", r(10, 15), 2, false],
    ["6:00, proposte scadute da sole", r(6, 0), 2, true],
  ];
  for (const [nome, quando, righe, conProposte] of casi) {
    it(`${nome}: al massimo 45 query e 15 sottorichieste`, async () => {
      const s = await prepara(righe, conProposte);
      const c = contaQuery();
      const esito = await giro(c.env, quando);
      expect(esito.errori).toEqual([]);
      expect(esito.fatti.length).toBeGreaterThan(0);
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto()).toBeLessThanOrEqual(15);
    });
  }

  // Con gli avvisi pieni di lavoro: 12 lead con lo SLA scaduto, 3 pause finite, il foglio rotto da avvisare.
  async function conAvvisi() {
    for (let i = 0; i < 12; i++) await insertLead(`s${i}`, { stage_id: "da-chiamare-prima-volta", created_at: r(8, 0) - i, owner_id: "tommaso" });
    for (let i = 0; i < 3; i++) await insertLead(`pz${i}`, { stage_id: "in-attesa-decisione", paused_until: r(8, 0), owner_id: "tommaso" });
    await env.DB.prepare("INSERT INTO integration_status (key, ok, last_error, error_id) VALUES ('resend', 0, 'giù', 'ab12cd34')").run();
  }
  const casiAvvisi: [string, number, number, string[]][] = [
    ["11:05, foglio, avvisi pieni e conferme", r(11, 5), 2, ["foglio", "avvisi"]],
    ["11:15, foglio, Meta, avvisi pieni e conferme", r(11, 15), 2, ["foglio", "meta"]],
    ["12:00, tutto più Meta 48 ore", r(12, 0), 1, ["foglio", "meta"]],
    ["11:10, foglio vuoto, avvisi pieni e conferme", r(11, 10), 0, ["foglio", "avvisi", "consegna", "conferme"]],
  ];
  for (const [nome, quando, righe, devono] of casiAvvisi) {
    it(`${nome}: al massimo 45 query e 15 sottorichieste, riga giro compresa`, async () => {
      const s = await prepara(righe);
      await conAvvisi();
      const c = contaQuery();
      const esito = await giro(c.env, quando);
      expect(esito.errori).toEqual([]);
      expect(esito.fatti).toEqual(expect.arrayContaining(devono));
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto()).toBeLessThanOrEqual(15);
    });
  }
  // Review Focus 2: 12 push in attesa (un dispositivo, 12 avvisi da consegnare) insieme a tutto il resto.
  // Chiavi VAPID generate al volo: nel config dei test non ce ne sono.
  async function conPush(quando: number) {
    const v = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pubblica = b64u((await crypto.subtle.exportKey("raw", v.publicKey)) as ArrayBuffer);
    const privata = (await crypto.subtle.exportKey("jwk", v.privateKey)).d!;
    const tel = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const p256dh = b64u((await crypto.subtle.exportKey("raw", tel.publicKey)) as ArrayBuffer);
    await env.DB.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, etichetta, created_at) VALUES ('sub1', 'tommaso', 'https://push.esempio.it/1', ?, ?, 'iPhone', 0)")
      .bind(p256dh, b64u(crypto.getRandomValues(new Uint8Array(16)))).run();
    for (let i = 0; i < 12; i++) {
      await env.DB.prepare("INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, created_at) VALUES (?, ?, 'tommaso', 'sla_90', ?, 'Prima chiamata tra 30 minuti', ?)")
        .bind(`np${i}`, `sla_90:P${i}:tommaso`, `P${i}`, quando - 60_000 - i).run();
    }
    return { VAPID_PUBLIC_KEY: pubblica, VAPID_PRIVATE_KEY: privata };
  }
  const casiPush: [string, number, number, boolean, string[]][] = [
    ["10:00, 2 righe nel foglio, Meta, conferme, Meta 48 ore e 12 push", r(10, 0), 2, false, ["foglio"]],
    ["10:05, foglio, conferme e 12 push", r(10, 5), 2, false, ["foglio", "avvisi"]],
    ["10:10, 1 riga nel foglio, conferme, inviti e 12 push", r(10, 10), 1, false, ["foglio", "avvisi", "consegna"]],
    // Con le push collegate la riserva tiene fuori Meta finché il foglio ha righe nuove: riprova alle :30.
    ["10:15, foglio, Meta, conferme e 12 push", r(10, 15), 2, false, ["foglio", "consegna"]],
    ["11:05, foglio, avvisi pieni, conferme e 12 push", r(11, 5), 2, true, ["foglio", "avvisi"]],
    ["11:10, foglio vuoto, avvisi pieni, conferme e 12 push", r(11, 10), 0, true, ["foglio", "avvisi", "consegna"]],
    ["6:00, proposte scadute e 12 push", r(6, 0), 2, false, ["proposte_scadute"]],
  ];
  for (const [nome, quando, righe, avvisiPieni, devono] of casiPush) {
    it(`${nome}: al massimo 45 query, 15 sottorichieste e 10 push, riga giro compresa`, async () => {
      const s = await prepara(righe, quando === r(6, 0));
      if (avvisiPieni) await conAvvisi();
      const chiavi = await conPush(quando);
      const c = contaQuery();
      const esito = await giro({ ...c.env, ...chiavi }, quando);
      expect(esito.errori).toEqual([]);
      expect(esito.fatti).toEqual(expect.arrayContaining(devono));
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto()).toBeLessThanOrEqual(15);
      expect(s.push()).toBeLessThanOrEqual(10);
      if (esito.fatti.includes("consegna")) expect(s.push()).toBeGreaterThan(0);
    });
  }

  it("foglio vuoto e 12 push: 10 partono in questo giro, le 2 restanti al giro dopo", async () => {
    const s = await prepara(0);
    const chiavi = await conPush(r(11, 10));
    const primo = await giro({ ...env, ...chiavi }, r(11, 10));
    expect(primo.fatti).toContain("consegna");
    expect(s.push()).toBe(10);
    const secondo = await giro({ ...env, ...chiavi }, r(11, 20));
    expect(secondo.fatti).toContain("consegna");
    // Al secondo giro partono le 2 rimaste più gli avvisi SLA nati nel frattempo: mai oltre 10 per giro.
    expect(s.push()).toBeGreaterThanOrEqual(12);
    expect(s.push()).toBeLessThanOrEqual(20);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE push_at IS NULL AND id LIKE 'np%'").first<{ n: number }>())?.n).toBe(0);
  });

  it("senza chiavi VAPID la consegna non consuma sottorichieste: le conferme hanno il limite pieno", async () => {
    await prepara(0);
    await conPush(r(11, 10));
    const conferme = LAVORI.conferme!;
    let limite = 0;
    const salvato = conferme.esegui;
    conferme.esegui = async (e, n, l) => { limite = l; return salvato(e, n, l); };
    try {
      const esito = await giro(env, r(11, 10));
      expect(esito.fatti).toEqual(expect.arrayContaining(["consegna", "conferme"]));
      // Senza il rimborso le sottorichieste rimaste sarebbero 1 (15 meno 4 del foglio meno 10 della consegna):
      // con il rimborso il limite delle conferme dipende solo dalle query rimaste.
      expect(limite).toBeGreaterThan(1);
    } finally {
      conferme.esegui = salvato;
    }
  });

  // Telegram collegato: la chat di tommaso, 8 avvisi "SLA scaduto" in attesa e un codice di collegamento di diego.
  // Telegram passa dopo la consegna delle push; conta nelle stesse sottorichieste del giro.
  async function conTelegram(quando: number, conta: { sotto: number; messaggi: number }) {
    await createUser("diego", "password-lunga-2", "Diego");
    await env.DB.prepare("UPDATE users SET telegram_chat_id = '4242' WHERE id = 'tommaso'").run();
    await env.DB.prepare("UPDATE users SET telegram_codice = 'codice-di-diego', telegram_codice_at = ?1 WHERE id = 'diego'").bind(quando - 60_000).run();
    for (let i = 0; i < 8; i++) {
      await env.DB.prepare("INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, created_at) VALUES (?, ?, 'tommaso', 'sla_scaduto', ?, 'Prima chiamata scaduta', ?)")
        .bind(`nt${i}`, `sla_scaduto:T${i}:tommaso`, `T${i}`, quando - 60_000 - i).run();
    }
    setTelegramFetch(async (url) => {
      conta.sotto++;
      if (url.includes("sendMessage")) conta.messaggi++;
      if (url.includes("getUpdates") && !url.includes("offset=")) return Response.json({ ok: true, result: [{ update_id: 5, message: { chat: { id: 99 }, text: "/start codice-di-diego" } }] });
      return Response.json({ ok: true, result: {} });
    });
  }
  const casiTelegram: [string, number, number, boolean, boolean, string[]][] = [
    ["10:00, 2 righe nel foglio, Meta, 12 push e Telegram", r(10, 0), 2, false, true, ["foglio"]],
    ["10:05, foglio, 12 push e Telegram", r(10, 5), 2, false, true, ["foglio", "avvisi"]],
    ["10:10, 1 riga nel foglio, 12 push e Telegram", r(10, 10), 1, false, true, ["foglio", "avvisi", "consegna"]],
    ["10:15, foglio, Meta, 12 push e Telegram", r(10, 15), 2, false, true, ["foglio", "consegna"]],
    ["11:05, foglio, avvisi pieni, 12 push e Telegram", r(11, 5), 2, true, true, ["foglio", "avvisi"]],
    ["11:10, foglio vuoto, avvisi pieni, 12 push e Telegram", r(11, 10), 0, true, true, ["foglio", "avvisi", "consegna", "telegram"]],
    ["11:10, foglio vuoto, avvisi pieni e Telegram senza push", r(11, 10), 0, true, false, ["foglio", "avvisi", "telegram", "conferme"]],
    ["10:05, arretrato di 10 righe, 12 push e Telegram", r(10, 5), 10, false, true, ["foglio", "consegna"]],
    ["6:00, proposte scadute e Telegram", r(6, 0), 2, false, true, ["proposte_scadute"]],
  ];
  for (const [nome, quando, righe, avvisiPieni, conPushAttive, devono] of casiTelegram) {
    it(`${nome}: al massimo 45 query, 15 sottorichieste, 10 push e 5 unità di Telegram, riga giro compresa`, async () => {
      const s = await prepara(righe, quando === r(6, 0));
      if (avvisiPieni) await conAvvisi();
      const chiavi = conPushAttive ? await conPush(quando) : {};
      const tg = { sotto: 0, messaggi: 0 };
      await conTelegram(quando, tg);
      const c = contaQuery();
      const esito = await giro({ ...c.env, ...chiavi }, quando);
      expect(esito.errori).toEqual([]);
      expect(esito.fatti).toEqual(expect.arrayContaining(devono));
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto() + tg.sotto).toBeLessThanOrEqual(15);
      expect(s.push()).toBeLessThanOrEqual(10);
      expect(tg.sotto).toBeLessThanOrEqual(5);
      if (esito.fatti.includes("telegram")) expect(tg.messaggi).toBeGreaterThan(0);
    });
  }

  // Riserva per la consegna: con un arretrato nel foglio (10 righe nuove) ogni giro manda almeno 2 push.
  for (const [nome, quando] of [["10:05", r(10, 5)], ["10:10", r(10, 10)], ["10:15 con Meta", r(10, 15)], ["11:05 con avvisi pieni", r(11, 5)]] as const) {
    it(`arretrato nel foglio e 12 push alle ${nome}: almeno 2 push partono, totale entro 45`, async () => {
      const s = await prepara(10);
      if (nome.includes("avvisi")) await conAvvisi();
      const chiavi = await conPush(quando);
      const c = contaQuery();
      const esito = await giro({ ...c.env, ...chiavi }, quando);
      expect(esito.errori).toEqual([]);
      expect(esito.fatti).toEqual(expect.arrayContaining(["foglio", "consegna"]));
      expect(s.push()).toBeGreaterThanOrEqual(2);
      expect(s.push()).toBeLessThanOrEqual(10);
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto()).toBeLessThanOrEqual(15);
    });
  }
});

describe("arretrato nel foglio", () => {
  // Scenari scritti con lo SLA di 120 minuti: il conto delle query vale con quegli avvisi.
  beforeEach(async () => {
    await env.DB.prepare(`UPDATE stage_rules SET params = '{"minuti":120,"avvisoMinuti":90}' WHERE id = 'sla-prima'`).run();
  });
  it("11:10 con 10 righe nuove, avvisi da creare e un invito in coda: l'invito parte e il totale resta sotto 45", async () => {
    await createUser();
    await foglioFinto(Array.from({ length: 10 }, (_, i) => rigaFoglio(i)));
    for (let i = 0; i < 3; i++) await insertLead(`s${i}`, { stage_id: "da-chiamare-prima-volta", created_at: r(8, 0) - i, owner_id: "tommaso" });
    for (let i = 0; i < 6; i++) await insertLead(`c${i}`, { source: "meta", email: `conf${i}@esempio.it`, confirmation_error: "Resend non raggiungibile, si riprova", confirmation_attempts: 1, created_at: r(10, 0) - i });
    await insertLead("inv0", { email: "anna@esempio.it", contact_name: "Anna Prova" });
    await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, invite_queued_at, created_at, updated_at) VALUES ('kq0', 'inv0', 'conoscenza', ?, ?, ?, ?)")
      .bind(r(11, 10) + 2 * GIORNO, NOW, NOW, NOW).run();
    // Gli avvisi SLA sono nati al giro prima: in questo giro gli avvisi costano le sole 8 fisse.
    await controllaAvvisi(env, r(11, 5), 12);
    const c = contaQuery();
    const esito = await giro(c.env, r(11, 10));
    expect(esito.errori).toEqual([]);
    expect(esito.fatti).toEqual(["foglio", "avvisi", "consegna", "telegram", "conferme"]);
    expect((await env.DB.prepare("SELECT count(*) n FROM calls WHERE invite_sent_at IS NOT NULL").first<{ n: number }>())?.n).toBe(1);
    expect(c.n()).toBeLessThanOrEqual(45);
    expect(esito.query).toBeLessThanOrEqual(45);
  });

  // Prima lettura del foglio di Andrea: tante righe nuove. Il foglio prende 1 lead e lascia il resto
  // del budget a Meta e alle conferme, che hanno scadenze più strette.
  it("10:15 con 10 righe nuove e 3 lead Meta in coda: Meta gira e il totale resta sotto 45", async () => {
    await createUser();
    await foglioFinto(Array.from({ length: 10 }, (_, i) => rigaFoglio(i)));
    for (let i = 0; i < 3; i++) await insertLead(`m${i}`, { source: "meta", meta_lead_id: `lg-${i}`, meta_status: "pending", meta_attempts: 0, stage_id: "da-chiamare-prima-volta" });
    let meta = 0;
    setMetaFetch(async () => { meta++; return Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: [`meta${meta}@esempio.it`] }, { name: "company_name", values: ["Bar Prova"] }] }); });
    const c = contaQuery();
    const esito = await giro(c.env, r(10, 15));
    expect(esito.fatti).toEqual(expect.arrayContaining(["foglio", "meta"]));
    expect(esito.errori).toEqual([]);
    expect(meta).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare("SELECT count(*) n FROM leads WHERE source = 'foglio_andrea'").first()).toEqual({ n: 1 });
    expect(c.n()).toBeLessThanOrEqual(45);
    expect(esito.query).toBeLessThanOrEqual(45);
  });

  it("10:05 con 10 righe nuove e 6 conferme in errore: le conferme girano e il totale resta sotto 45", async () => {
    await createUser();
    await foglioFinto(Array.from({ length: 10 }, (_, i) => rigaFoglio(i)));
    for (let i = 0; i < 6; i++) await insertLead(`c${i}`, { source: "meta", email: `conf${i}@esempio.it`, confirmation_error: "Resend non raggiungibile, si riprova", confirmation_attempts: 1, created_at: r(10, 0) - i });
    let email = 0;
    setEmailFetch(async () => { email++; return Response.json({ id: `re_${email}` }); });
    const c = contaQuery();
    const esito = await giro(c.env, r(10, 5));
    expect(esito.fatti).toEqual(["foglio", "avvisi", "consegna", "telegram", "conferme"]);
    expect(esito.errori).toEqual([]);
    const ritentate = await env.DB.prepare("SELECT count(*) n FROM leads WHERE id LIKE 'c%' AND confirmation_sent_at IS NOT NULL").first<{ n: number }>();
    expect(ritentate?.n).toBeGreaterThanOrEqual(1);
    expect(c.n()).toBeLessThanOrEqual(45);
    expect(esito.query).toBeLessThanOrEqual(45);
  });
});

// Lavoro "claude" (Task 6). Il gestore finto usa il massimo che il contratto concede a un tipo: 7 query D1 e
// una chiamata a Claude (sottorichiesta contata dal fetcher finto). Le stime del giro vengono da qui.
describe("giro con Claude", () => {
  const salvati = { ...TIPI };
  let chiamateClaude = 0;
  function tipoFinto() {
    chiamateClaude = 0;
    setClaudeFetch(async () => { chiamateClaude++; return rispostaClaude({ testo: '{"ok":true}', ingresso: 1_200, uscita: 80 }); });
    registraTipo("classificazione", {
      stima: () => ({ modello: "claude-haiku-4-5", ingresso: 1_500, maxTokens: 300, ricerche: 0 }),
      esegui: async (e, job, imp) => {
        for (let i = 0; i < 7; i++) await e.DB.prepare("SELECT ?1 AS id").bind(job.entityId).first();
        const r = await chiamaClaude(e, { modello: imp.modelli.classificazione, sistema: "s", testo: "t", maxTokens: 300, schema: { type: "object" } });
        return { uso: r.uso, modello: r.modello };
      },
      alErrore: async () => undefined,
      // Come la classificazione vera: uno statement nella prima batch della coda.
      accodaDaSolo: (db) => db.prepare("SELECT 1"),
    });
  }
  afterEach(() => {
    for (const k of Object.keys(TIPI)) delete (TIPI as Record<string, unknown>)[k];
    Object.assign(TIPI, salvati);
  });
  async function treLavori(quando: number) {
    for (const e of ["L1", "L2", "L3"]) await accoda(env.DB, { tipo: "classificazione", entityId: e, leadId: e }, quando - 60_000);
  }
  const fatti = async () => (await env.DB.prepare("SELECT count(*) n FROM ai_jobs WHERE stato = 'pronto'").first<{ n: number }>())?.n ?? 0;

  it("misura: 3 lavori, un fermo e l'avviso del tetto stanno in 8 fisse più 11 a lavoro", async () => {
    await createUser();
    tipoFinto();
    registraTipo("scheda", { stima: () => ({ modello: "claude-sonnet-5-5", ingresso: 160_000, maxTokens: 8_000, ricerche: 5 }), esegui: async () => { throw new Error("non deve partire"); }, alErrore: async () => undefined });
    await env.DB.prepare("INSERT INTO claude_usage (id, tipo, modello, mese, costo_micros, created_at) VALUES ('u1', 'scheda', 'claude-sonnet-5-5', '2026-10', 19800000, 0)").run();
    await accoda(env.DB, { tipo: "scheda", entityId: "S1" }, r(11, 0));
    await treLavori(r(11, 10));
    const contatore = { query: 0 };
    const esito = await lavoraCoda({ ...env, DB: contaD1(env.DB, contatore) }, r(11, 10), 3);
    expect(esito).toEqual({ fatti: 3, fermi: 1, errori: 0 });
    expect(contatore.query).toBe(LAVORI.claude!.fisse + 3 * LAVORI.claude!.perUnita);
    expect(chiamateClaude).toBeLessThanOrEqual(3 * LAVORI.claude!.sottoPerUnita);
  });

  it("senza lavori in coda costa 4 query; senza tipi o senza chiave nessuna", async () => {
    tipoFinto();
    const c1 = { query: 0 };
    await lavoraCoda({ ...env, DB: contaD1(env.DB, c1) }, r(11, 10), 3);
    expect(c1.query).toBe(4);
    const c2 = { query: 0 };
    await lavoraCoda({ ...env, DB: contaD1(env.DB, c2), ANTHROPIC_API_KEY: "" }, r(11, 10), 3);
    expect(c2.query).toBe(0);
  });

  // Con le fisse degli altri lavori del giro (circa 13 query) a Claude ne restano 31: 2 lavori (8 + 2 x 11).
  // Il terzo parte al giro dopo.
  it("giro senza altro da fare: 2 lavori di Claude in questo giro, il terzo al giro dopo", async () => {
    await createUser();
    tipoFinto();
    await treLavori(r(11, 10));
    const c = contaQuery();
    const esito = await giro(c.env, r(11, 10));
    expect(esito.errori).toEqual([]);
    expect(esito.fatti).toContain("claude");
    expect(await fatti()).toBe(2);
    expect(c.n()).toBeLessThanOrEqual(45);
    const dopo = await giro(env, r(11, 15));
    expect(dopo.errori).toEqual([]);
    expect(await fatti()).toBe(3);
    expect(chiamateClaude).toBe(3);
  });

  // Review del Task 14a, minore a: un gestore che va in errore dopo aver letto e che scrive in alErrore resta
  // nel contratto (esegui più alErrore entro 7 query): il giro intero sta sotto le 45 query misurate da contaD1.
  it("giro con lavori Claude che vanno in errore e usano alErrore: sotto le 45 query, lavori in errore e segnati", async () => {
    await createUser();
    tipoFinto();
    let segnati = 0;
    registraTipo("classificazione", {
      stima: () => ({ modello: "claude-haiku-4-5", ingresso: 1_500, maxTokens: 300, ricerche: 0 }),
      esegui: async (e, job, imp) => {
        for (let i = 0; i < 5; i++) await e.DB.prepare("SELECT ?1 AS id").bind(job.entityId).first();
        await chiamaClaude(e, { modello: imp.modelli.classificazione, sistema: "s", testo: "t", maxTokens: 300, schema: { type: "object" } });
        throw new Error("Risposta non valida");
      },
      alErrore: async (db, job) => { segnati++; await db.prepare("SELECT ?1 AS id").bind(job.id).run(); },
      accodaDaSolo: (db) => db.prepare("SELECT 1"),
    });
    await treLavori(r(11, 10));
    const c = contaQuery();
    const esito = await giro(c.env, r(11, 10));
    expect(esito.fatti).toContain("claude");
    expect(segnati).toBeGreaterThanOrEqual(1);
    expect(c.n()).toBeLessThanOrEqual(45);
    expect(esito.query).toBeLessThanOrEqual(45);
    const inErrore = await env.DB.prepare("SELECT count(*) n FROM ai_jobs WHERE stato = 'errore'").first<{ n: number }>();
    expect(inErrore?.n).toBe(segnati);
  });

  // Al primo giro del lunedì la revisione costa 14 query e a Claude ne restano 16 (gliene servono 19): il lavoro
  // aspetta in coda senza errori. Dal giro dopo la revisione costa 1 query e lunedì e Claude girano insieme.
  it("lunedì 7:00 e 7:05 con un lavoro Claude e il foglio vuoto: la revisione nasce, Claude entra al giro dopo insieme al lunedì, sotto le 45 query", async () => {
    await createUser();
    tipoFinto();
    const lun7 = daRoma(2026, 10, 12, 7, 0);
    await accoda(env.DB, { tipo: "classificazione", entityId: "L1", leadId: "L1" }, lun7 - 60_000);
    const c = contaQuery();
    const primo = await giro(c.env, lun7);
    expect(primo.errori).toEqual([]);
    expect(primo.fatti).toContain("lunedi");
    expect(primo.saltati).toContain("claude");
    expect(primo.query).toBeLessThanOrEqual(45);
    expect(await env.DB.prepare("SELECT count(*) n FROM weekly_reviews").first<{ n: number }>()).toEqual({ n: 1 });
    const c2 = contaQuery();
    const secondo = await giro(c2.env, lun7 + 5 * 60_000);
    expect(secondo.errori).toEqual([]);
    expect(secondo.fatti).toEqual(expect.arrayContaining(["lunedi", "claude"]));
    expect(await fatti()).toBe(1);
    expect(secondo.query).toBeLessThanOrEqual(45);
    expect(c2.n()).toBeLessThanOrEqual(45);
  });

  it("i 9 minuti senza lavori nuovi contano dall'inizio del giro: un lavoro lento prima di Claude li consuma", async () => {
    await createUser();
    tipoFinto();
    await treLavori(r(11, 10));
    let ora = 5_000_000;
    setOrologioCoda(() => ora);
    const salvato = LAVORI.meta_48h!;
    try {
      registraLavoro("meta_48h", { ...salvato, quando: () => true, esegui: async () => { ora += AVVIO_MAX_MS + 1; } });
      const esito = await giro(env, r(11, 10));
      expect(esito.fatti).toContain("claude");
      expect(await fatti()).toBe(0);
    } finally {
      registraLavoro("meta_48h", salvato);
      setOrologioCoda(null);
    }
  });

  // Review Focus 2: 2 lead dal foglio, 3 da Meta, conferme e inviti, 3 lavori Claude e 12 push in attesa.
  async function tuttoInAttesa(righeFoglio: number, quando: number) {
    await createUser();
    // Lavori attivi con le due task ricorrenti del modello predefinito: alle 7:00 e alle 7:30 ne nascono fino a 12.
    for (let i = 0; i < 8; i++) {
      await env.DB.prepare("INSERT INTO clients (id, name, scope, created_at) VALUES (?, ?, 'acceleriamo', 1)").bind(`kj${i}`, `Cliente ${i}`).run();
      await env.DB.prepare("INSERT INTO jobs (id, client_id, template_id, name, start_at, recurring_from_month, status, created_at) VALUES (?, ?, 'lt-automazione-su-misura', 'Automazione su misura', 1, '2026-10', 'attivo', 1)").bind(`j${i}`, `kj${i}`).run();
    }
    await foglioFinto(Array.from({ length: righeFoglio }, (_, i) => rigaFoglio(i)));
    for (let i = 0; i < 3; i++) await insertLead(`m${i}`, { source: "meta", meta_lead_id: `lg-${i}`, meta_status: "pending", meta_attempts: 0, stage_id: "da-chiamare-prima-volta" });
    for (let i = 0; i < 5; i++) await insertLead(`c${i}`, { source: "meta", email: `conf${i}@esempio.it`, confirmation_error: "Resend non raggiungibile, si riprova", confirmation_attempts: 1, created_at: r(10, 0) - i });
    for (let i = 0; i < 2; i++) {
      await insertLead(`inv${i}`, { email: `anna${i}@esempio.it`, contact_name: "Anna Prova" });
      await env.DB.prepare("INSERT INTO calls (id, lead_id, kind, scheduled_at, invite_queued_at, created_at, updated_at) VALUES (?, ?, 'conoscenza', ?, ?, ?, ?)")
        .bind(`kq${i}`, `inv${i}`, r(10, 0) + 2 * GIORNO, NOW, NOW, NOW).run();
    }
    let sotto = 0;
    setGoogleFetch(async () => { sotto++; return new Response([TESTATA_FOGLIO, ...Array.from({ length: righeFoglio }, (_, i) => rigaFoglio(i))].join("\n"), { headers: { "content-type": "text/csv" } }); });
    setEmailFetch(async () => { sotto++; return Response.json({ id: `re_${sotto}` }); });
    setMetaFetch(async () => { sotto++; return Response.json({ field_data: [{ name: "full_name", values: ["Anna Prova"] }, { name: "email", values: [`meta${sotto}@esempio.it`] }, { name: "company_name", values: ["Bar Prova"] }] }); });
    let push = 0;
    setPushFetch(async () => { sotto++; push++; return new Response("", { status: 201 }); });
    // Push: un dispositivo e 12 avvisi da consegnare, chiavi VAPID generate al volo.
    const v = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const tel = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    await env.DB.prepare("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, etichetta, created_at) VALUES ('sub1', 'tommaso', 'https://push.esempio.it/1', ?, ?, 'iPhone', 0)")
      .bind(b64u((await crypto.subtle.exportKey("raw", tel.publicKey)) as ArrayBuffer), b64u(crypto.getRandomValues(new Uint8Array(16)))).run();
    for (let i = 0; i < 12; i++) {
      await env.DB.prepare("INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, created_at) VALUES (?, ?, 'tommaso', 'sla_90', ?, 'Prima chiamata tra 30 minuti', ?)")
        .bind(`np${i}`, `sla_90:P${i}:tommaso`, `P${i}`, quando - 60_000 - i).run();
    }
    tipoFinto();
    await treLavori(quando);
    const chiavi = { VAPID_PUBLIC_KEY: b64u((await crypto.subtle.exportKey("raw", v.publicKey)) as ArrayBuffer), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", v.privateKey)).d! };
    return { sotto: () => sotto + chiamateClaude, push: () => push, chiavi };
  }
  const casi: [string, number, number][] = [
    ["10:00, foglio, Meta, conferme, Meta 48 ore", r(10, 0), 2],
    ["10:05, foglio e conferme", r(10, 5), 2],
    ["10:10, 1 riga nel foglio", r(10, 10), 1],
    ["10:15, foglio e Meta", r(10, 15), 2],
    ["11:10, foglio vuoto", r(11, 10), 0],
    ["6:00, proposte scadute", r(6, 0), 2],
    // Il lunedì alle 7 (ora di Roma) entra anche la revisione della settimana: 15 fisse.
    ["lunedì 7:00, foglio, Meta, conferme, Meta 48 ore, revisione", daRoma(2026, 10, 12, 7, 0), 2],
    ["lunedì 7:05, foglio, conferme, revisione", daRoma(2026, 10, 12, 7, 5), 1],
    ["lunedì 7:10, foglio vuoto, revisione", daRoma(2026, 10, 12, 7, 10), 0],
    // Alle 7:00 e alle 7:30 entrano anche le task ricorrenti dei lavori (2 fisse più una a task, al massimo 12).
    ["martedì 7:00, foglio, Meta, conferme, Meta 48 ore, task ricorrenti", r(7, 0), 2],
    ["martedì 7:30, foglio vuoto, task ricorrenti", r(7, 30), 0],
  ];
  for (const [nome, quando, righe] of casi) {
    it(`giro pieno alle ${nome}, 12 push e 3 lavori Claude: al massimo 45 query e 15 sottorichieste; Claude non entrato aspetta senza errori`, async () => {
      const s = await tuttoInAttesa(righe, quando);
      const c = contaQuery();
      const esito = await giro({ ...c.env, ...s.chiavi }, quando);
      expect(esito.errori).toEqual([]);
      expect(c.n()).toBeLessThanOrEqual(45);
      expect(esito.query).toBeLessThanOrEqual(45);
      expect(s.sotto()).toBeLessThanOrEqual(15);
      expect(s.push()).toBeLessThanOrEqual(10);
      expect(chiamateClaude).toBeLessThanOrEqual(3);
      const stati = await env.DB.prepare("SELECT stato, count(*) n FROM ai_jobs GROUP BY stato ORDER BY stato").all<{ stato: string; n: number }>();
      // I lavori che non sono entrati restano in coda: niente errori, niente fermi.
      expect(stati.results.every((x) => x.stato === "in_coda" || x.stato === "pronto")).toBe(true);
      expect(await fatti()).toBe(chiamateClaude);
      if (esito.fatti.includes("claude")) expect(chiamateClaude).toBeGreaterThan(0);
    });
  }
});

