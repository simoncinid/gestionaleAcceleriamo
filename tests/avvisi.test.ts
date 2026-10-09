// tests/avvisi.test.ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../worker/db/client";
import { avvisa, chiudiAvvisi } from "../worker/avvisi/service";
import { controllaAvvisi, controllaMeta48 } from "../worker/avvisi/controlli";
import { COSTO_AVVISI } from "../worker/avvisi/controlli";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma } from "../worker/lib/roma";
import { call, createUser, loginCookie } from "./helpers";

const db = () => getDb(env.DB);
const lun = (h: number, m = 0) => daRoma(2026, 10, 12, h, m);

async function lead(id: string, campi: Record<string, unknown> = {}) {
  const base = { id, company: `Officina ${id}`, stage_id: "da-chiamare-prima-volta", stage_changed_at: lun(9), created_at: lun(9), updated_at: lun(9), owner_id: "tommaso", source: "meta", ...campi };
  const k = Object.keys(base);
  await env.DB.prepare(`INSERT INTO leads (${k.join(",")}) VALUES (${k.map(() => "?").join(",")})`).bind(...Object.values(base)).run();
}

beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  await createUser("diego", "password-lunga-2", "Diego Simoncini");
});

describe("avvisa", () => {
  it("stesso evento due volte: un avviso per persona", async () => {
    const a = { evento: "sla_scaduto" as const, entityId: "L1", titolo: "SLA scaduto: Officina L1" };
    expect(await avvisa(db(), a, lun(10))).toBe(2);
    expect(await avvisa(db(), a, lun(10, 5))).toBe(0);
    const n = await env.DB.prepare("SELECT count(*) n FROM notifications").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("responsabile: solo lui; senza responsabile: tutti e due", async () => {
    expect(await avvisa(db(), { evento: "sla_90", entityId: "L2", titolo: "x", responsabile: "diego" }, lun(10))).toBe(1);
    expect(await avvisa(db(), { evento: "sla_90", entityId: "L3", titolo: "x", responsabile: null }, lun(10))).toBe(2);
  });

  it("gli eventi senza push nascono già consegnati sulla push", async () => {
    await avvisa(db(), { evento: "proposta_oggi", entityId: "P1", titolo: "x", responsabile: "tommaso" }, lun(10));
    const r = await env.DB.prepare("SELECT push_at, telegram_at FROM notifications").first<{ push_at: number; telegram_at: number }>();
    expect(r?.push_at).toBe(lun(10));
    expect(r?.telegram_at).toBe(lun(10));
  });
});

describe("controllaAvvisi", () => {
  it("preavviso a 90 minuti al responsabile, scaduto a tutti e due", async () => {
    await lead("L1"); // arrivato lunedì alle 9:00, SLA 120 minuti lavorativi: scade alle 11:00
    await controllaAvvisi(env, lun(10, 31), 10);
    let righe = await env.DB.prepare("SELECT evento, user_id FROM notifications ORDER BY user_id").all<{ evento: string; user_id: string }>();
    expect(righe.results).toEqual([{ evento: "sla_90", user_id: "tommaso" }]);
    await controllaAvvisi(env, lun(11, 1), 10);
    righe = await env.DB.prepare("SELECT evento, user_id FROM notifications WHERE evento = 'sla_scaduto' ORDER BY user_id").all();
    expect(righe.results).toHaveLength(2);
  });

  it("chiusura automatica: chiamato il lead, gli avvisi SLA si chiudono", async () => {
    await lead("L1");
    await controllaAvvisi(env, lun(11, 1), 10);
    await env.DB.prepare("UPDATE leads SET first_response_at = ? WHERE id = 'L1'").bind(lun(11, 3)).run();
    await controllaAvvisi(env, lun(11, 5), 10);
    const aperti = await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>();
    expect(aperti?.n).toBe(0);
  });

  it("fine pausa: la regola rimette il lead in giro e avvisa il responsabile", async () => {
    await lead("L4", { stage_id: "probabilmente-bloccato", paused_until: lun(8), owner_id: "diego" });
    await controllaAvvisi(env, lun(9), 10);
    const l = await env.DB.prepare("SELECT paused_until, next_action FROM leads WHERE id = 'L4'").first<{ paused_until: number | null; next_action: string }>();
    expect(l).toEqual({ paused_until: null, next_action: "Richiamare dopo la pausa" });
    const a = await env.DB.prepare("SELECT user_id FROM notifications WHERE evento = 'fine_pausa'").all();
    expect(a.results).toEqual([{ user_id: "diego" }]);
  });

  it("integrazione rotta: avviso a tutti e due, chiuso quando torna verde", async () => {
    await env.DB.prepare("INSERT INTO integration_status (key, ok, last_error, error_id) VALUES ('foglio', 0, 'giù', 'ab12cd34')").run();
    await controllaAvvisi(env, lun(10), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento='integrazione_rotta' AND closed_at IS NULL").first<{ n: number }>())?.n).toBe(2);
    await env.DB.prepare("UPDATE integration_status SET ok = 1 WHERE key = 'foglio'").run();
    await controllaAvvisi(env, lun(10, 5), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>())?.n).toBe(0);
  });

  it("rispetta il limite di avvisi per giro", async () => {
    for (const id of ["A", "B", "C", "D"]) await lead(id);
    const r = await controllaAvvisi(env, lun(11, 1), 2);
    expect(r.creati).toBeLessThanOrEqual(4); // 2 eventi, 2 persone
  });
});

describe("turni dello stesso evento", () => {
  it("seconda pausa: dopo la prima chiusa nasce un avviso nuovo", async () => {
    await lead("L5", { stage_id: "probabilmente-bloccato", paused_until: lun(8), owner_id: "diego" });
    await controllaAvvisi(env, lun(9), 10);
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a1', 'L5', 'nota', 'Sentito, richiamo a fine mese', 'diego', ?)").bind(lun(9, 30)).run();
    await controllaAvvisi(env, lun(9, 35), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>())?.n).toBe(0);
    const dieciGiorni = lun(8) + 10 * 86_400_000;
    await env.DB.prepare("UPDATE leads SET paused_until = ? WHERE id = 'L5'").bind(dieciGiorni).run();
    await controllaAvvisi(env, dieciGiorni + 60_000, 10);
    const aperti = await env.DB.prepare("SELECT user_id FROM notifications WHERE evento = 'fine_pausa' AND closed_at IS NULL").all();
    expect(aperti.results).toEqual([{ user_id: "diego" }]);
  });

  it("la nota di sistema della fine pausa non chiude l'avviso", async () => {
    await lead("L6", { stage_id: "probabilmente-bloccato", paused_until: lun(8), owner_id: "diego" });
    await controllaAvvisi(env, lun(9), 10);
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a2', 'L6', 'nota', 'automatica', NULL, ?)").bind(lun(9, 30)).run();
    await controllaAvvisi(env, lun(9, 35), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>())?.n).toBe(1);
  });

  it("proposta il giorno dopo: chiamata fatta, torna da seguire 3 giorni dopo, nuovo avviso", async () => {
    await lead("L7", { stage_id: "in-attesa-decisione", next_action_at: lun(9), owner_id: "tommaso" });
    await env.DB.prepare("INSERT INTO proposals (id, number, lead_id, status, registered_via, created_at, updated_at) VALUES ('p7', 'ACC-7', 'L7', 'presentata', 'manuale', ?, ?)").bind(lun(8), lun(8)).run();
    await controllaAvvisi(env, lun(10), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'proposta_oggi'").first<{ n: number }>())?.n).toBe(1);
    await env.DB.prepare("INSERT INTO activities (id, lead_id, type, body, author_id, created_at) VALUES ('a3', 'L7', 'chiamata', 'Ci pensa', 'tommaso', ?)").bind(lun(11)).run();
    const fra3 = lun(9) + 3 * 86_400_000;
    await env.DB.prepare("UPDATE leads SET next_action_at = ? WHERE id = 'L7'").bind(fra3).run();
    await controllaAvvisi(env, lun(11, 5), 10);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>())?.n).toBe(0);
    await controllaAvvisi(env, fra3 + 3_600_000, 10);
    const r = await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'proposta_oggi' AND closed_at IS NULL").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});

describe("costo del lavoro", () => {
  it("vuoto: 8 query; con 3 pause finite e 10 avvisi resta dentro fisse più una per avviso", async () => {
    const c = { query: 0 };
    await controllaAvvisi({ ...env, DB: contaD1(env.DB, c) }, lun(10), COSTO_AVVISI.max);
    expect(c.query).toBe(8);
    for (const id of ["P1", "P2", "P3", "P4"]) await lead(id, { stage_id: "probabilmente-bloccato", paused_until: lun(8) });
    for (let i = 0; i < 12; i++) await lead(`S${i}`);
    c.query = 0;
    const r = await controllaAvvisi({ ...env, DB: contaD1(env.DB, c) }, lun(11, 1), COSTO_AVVISI.max);
    expect(r.creati).toBeGreaterThan(0);
    expect(c.query).toBeLessThanOrEqual(COSTO_AVVISI.fisse + COSTO_AVVISI.max * COSTO_AVVISI.perUnita);
    // Tre pause chiuse in questo giro, ognuna col suo avviso; la quarta al giro dopo.
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'fine_pausa'").first<{ n: number }>())?.n).toBe(3);
  });

  it("Meta 48 ore: 3 query", async () => {
    await lead("M1", { created_at: lun(9) - 49 * 3_600_000 });
    const c = { query: 0 };
    await controllaMeta48({ ...env, DB: contaD1(env.DB, c) }, lun(10));
    expect(c.query).toBe(3);
  });
});

describe("Meta 48 ore", () => {
  it("avvisa se l'ultimo lead Meta ha più di 48 ore, una volta", async () => {
    await lead("M1", { created_at: lun(9) - 49 * 3_600_000 });
    expect(await controllaMeta48(env, lun(10))).toBe(true);
    await controllaMeta48(env, lun(11));
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento='meta_48h'").first<{ n: number }>())?.n).toBe(2);
  });
});

describe("rotte degli avvisi", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/notifications")).status).toBe(401);
    expect((await call("/api/notifications/letti", { method: "POST", json: {} })).status).toBe(401);
  });

  it("elenco solo degli aperti della persona e segna letti", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    await avvisa(db(), { evento: "lead_nuovo", entityId: "L9", titolo: "Lead nuovo: Officina L9", href: "/commerciale/lead/L9" }, lun(10));
    await chiudiAvvisi(db(), ["sla_90"], "L9", lun(10));
    let r = await (await call("/api/notifications", {}, cookie)).json<{ avvisi: { id: string; letto: boolean }[]; nonLetti: number }>();
    expect(r.nonLetti).toBe(1);
    await call("/api/notifications/letti", { method: "POST", json: {} }, cookie);
    r = await (await call("/api/notifications", {}, cookie)).json();
    expect(r.nonLetti).toBe(0);
    expect(r.avvisi[0].letto).toBe(true);
  });
});
