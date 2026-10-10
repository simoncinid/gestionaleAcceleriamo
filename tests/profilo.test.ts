import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { call, createUser, loginCookie } from "./helpers";

let cookie = "";
beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  cookie = await loginCookie("tommaso", "password-lunga-1");
});

describe("profilo", () => {
  it("legge i valori di partenza: tutti gli eventi accesi, silenzio spento", async () => {
    const p = await (await call("/api/me/profilo", {}, cookie)).json<{ notifyPrefs: Record<string, boolean>; quietHours: { attive: boolean }; telegram: boolean }>();
    expect(Object.values(p.notifyPrefs).every(Boolean)).toBe(true);
    expect(p.quietHours.attive).toBe(false);
    expect(p.telegram).toBe(false);
  });
  it("salva avvisi per evento e ore di silenzio", async () => {
    const r = await call("/api/me", { method: "PATCH", json: { notifyPrefs: { meta_48h: false }, quietHours: { attive: true, da: "22:00", a: "07:30" } } }, cookie);
    expect(r.status).toBe(200);
    const u = await env.DB.prepare("SELECT notify_prefs, quiet_hours FROM users WHERE id = 'tommaso'").first<{ notify_prefs: string; quiet_hours: string }>();
    expect(JSON.parse(u!.notify_prefs)).toMatchObject({ meta_48h: false, lead_nuovo: true });
    expect(JSON.parse(u!.quiet_hours)).toEqual({ attive: true, da: "22:00", a: "07:30" });
  });
  it("rifiuta un orario scritto male", async () => {
    const r = await call("/api/me", { method: "PATCH", json: { quietHours: { attive: true, da: "25:00", a: "07:30" } } }, cookie);
    expect(r.status).toBe(400);
  });
  it("cambio password: serve quella attuale, le altre sessioni si chiudono", async () => {
    const altra = await loginCookie("tommaso", "password-lunga-1");
    expect((await call("/api/me/password", { method: "POST", json: { attuale: "sbagliata-123", nuova: "password-nuova-22" } }, cookie)).status).toBe(400);
    expect((await call("/api/me/password", { method: "POST", json: { attuale: "password-lunga-1", nuova: "corta" } }, cookie)).status).toBe(400);
    expect((await call("/api/me/password", { method: "POST", json: { attuale: "password-lunga-1", nuova: "password-nuova-22" } }, cookie)).status).toBe(200);
    expect((await call("/api/me/profilo", {}, cookie)).status).toBe(200);
    expect((await call("/api/me/profilo", {}, altra)).status).toBe(401);
    expect(await loginCookie("tommaso", "password-nuova-22")).not.toBe("");
  });
  it("401 senza sessione", async () => {
    expect((await call("/api/me/profilo")).status).toBe(401);
    expect((await call("/api/me", { method: "PATCH", json: {} })).status).toBe(401);
    expect((await call("/api/me/password", { method: "POST", json: {} })).status).toBe(401);
  });
});

describe("profilo: casi in più", () => {
  it("JSON rovinato nel profilo: valori di partenza, mai un errore", async () => {
    await env.DB.prepare("UPDATE users SET notify_prefs = '{rotto', quiet_hours = '[1,2]' WHERE id = 'tommaso'").run();
    const r = await call("/api/me/profilo", {}, cookie);
    expect(r.status).toBe(200);
    const p = await r.json<{ notifyPrefs: Record<string, boolean>; quietHours: { attive: boolean } }>();
    expect(Object.values(p.notifyPrefs).every(Boolean)).toBe(true);
    expect(p.quietHours.attive).toBe(false);
  });
  it("le preferenze si sommano: spegnerne una non riaccende le altre", async () => {
    await call("/api/me", { method: "PATCH", json: { notifyPrefs: { meta_48h: false } } }, cookie);
    await call("/api/me", { method: "PATCH", json: { notifyPrefs: { sla_90: false } } }, cookie);
    const p = await (await call("/api/me/profilo", {}, cookie)).json<{ notifyPrefs: Record<string, boolean> }>();
    expect(p.notifyPrefs).toMatchObject({ meta_48h: false, sla_90: false, lead_nuovo: true });
  });
  it("evento inventato o campo in più: 400", async () => {
    expect((await call("/api/me", { method: "PATCH", json: { notifyPrefs: { inventato: false } } }, cookie)).status).toBe(400);
    expect((await call("/api/me", { method: "PATCH", json: { username: "altro" } }, cookie)).status).toBe(400);
  });
  it("Telegram collegato e dispositivi raggiungibili", async () => {
    await env.DB.prepare("UPDATE users SET telegram_chat_id = '42' WHERE id = 'tommaso'").run();
    await env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, etichetta, rotta, created_at) VALUES
      ('S1', 'tommaso', 'https://push.esempio/1', 'k', 'a', 'iPhone', 0, 0), ('S2', 'tommaso', 'https://push.esempio/2', 'k', 'a', 'Mac', 1, 0)`).run();
    const p = await (await call("/api/me/profilo", {}, cookie)).json<{ telegram: boolean; dispositivi: number }>();
    expect(p).toMatchObject({ telegram: true, dispositivi: 1 });
  });
  it("cambio password nel registro", async () => {
    await call("/api/me/password", { method: "POST", json: { attuale: "password-lunga-1", nuova: "password-nuova-22" } }, cookie);
    const a = await env.DB.prepare("SELECT entity, action FROM audit_log WHERE user_id = 'tommaso'").first();
    expect(a).toEqual({ entity: "user", action: "password" });
  });
});
