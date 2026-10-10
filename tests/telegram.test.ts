import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../worker/app";
import { avvisa } from "../worker/avvisi/service";
import { getDb } from "../worker/db/client";
import { contaD1 } from "../worker/lib/bilancio";
import { daRoma } from "../worker/lib/roma";
import { giroTelegram, nuovoCodice } from "../worker/telegram/bot";
import { setTelegramFetch } from "../worker/telegram/fetcher";
import { call, createUser, loginCookie } from "./helpers";

beforeEach(async () => {
  await createUser("tommaso", "password-lunga-1", "Tommaso Rovini");
  await createUser("diego", "password-lunga-2", "Diego Simoncini");
});
afterEach(() => setTelegramFetch(null));

const collegaChat = (id: string, chat: string) => env.DB.prepare("UPDATE users SET telegram_chat_id = ?1 WHERE id = ?2").bind(chat, id).run();
const inCoda = async () => (await env.DB.prepare("SELECT count(*) n FROM notifications WHERE telegram_at IS NULL").first<{ n: number }>())?.n;

describe("collegamento", () => {
  it("il codice di /start salva la chat e poi conferma gli aggiornamenti letti", async () => {
    const codice = await nuovoCodice(env.DB, "tommaso", 1000);
    const chiamate: string[] = [];
    setTelegramFetch(async (url) => {
      chiamate.push(url.replace(/bot[^/]+/, "botX"));
      if (url.includes("getUpdates") && !url.includes("offset=")) {
        return Response.json({ ok: true, result: [{ update_id: 7, message: { chat: { id: 4242 }, text: `/start ${codice}` } }] });
      }
      return Response.json({ ok: true, result: [] });
    });
    const r = await giroTelegram(env, 2000, 5);
    expect(r.collegati).toBe(1);
    const u = await env.DB.prepare("SELECT telegram_chat_id AS chat, telegram_codice AS codice FROM users WHERE id = 'tommaso'").first();
    expect(u).toEqual({ chat: "4242", codice: null });
    expect(chiamate.some((c) => c.includes("offset=8"))).toBe(true);
  });

  it("senza codici in attesa non chiama getUpdates", async () => {
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return Response.json({ ok: true, result: [] }); });
    await giroTelegram(env, 2000, 5);
    expect(chiamate).toBe(0);
  });

  it("un codice scaduto (oltre 15 minuti) non viene più cercato", async () => {
    await nuovoCodice(env.DB, "tommaso", 0);
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return Response.json({ ok: true, result: [] }); });
    await giroTelegram(env, 16 * 60_000, 5);
    expect(chiamate).toBe(0);
  });

  it("al massimo 2 collegamenti per giro: il terzo resta a Telegram per il giro dopo", async () => {
    await createUser("andrea", "password-lunga-3", "Andrea");
    const codici = [await nuovoCodice(env.DB, "tommaso", 1000), await nuovoCodice(env.DB, "diego", 1000), await nuovoCodice(env.DB, "andrea", 1000)];
    const conferme: string[] = [];
    const tutti = codici.map((c, i) => ({ update_id: 10 + i, message: { chat: { id: 100 + i }, text: `/start ${c}` } }));
    setTelegramFetch(async (url) => {
      if (url.includes("offset=")) { conferme.push(/offset=(\d+)/.exec(url)![1]); return Response.json({ ok: true, result: [] }); }
      return Response.json({ ok: true, result: tutti });
    });
    expect((await giroTelegram(env, 2000, 5)).collegati).toBe(2);
    expect(conferme).toEqual(["12"]); // conferma fino al terzo escluso: Telegram lo ripete
    const andrea = await env.DB.prepare("SELECT telegram_chat_id AS chat FROM users WHERE id = 'andrea'").first<{ chat: string | null }>();
    expect(andrea?.chat).toBeNull();
  });

  it("un codice sbagliato non collega nessuno: risposta \"Codice non riconosciuto\" nella chat e conferma lo stesso", async () => {
    await nuovoCodice(env.DB, "tommaso", 1000);
    const conferme: string[] = [];
    const risposte: { chat_id: string; text: string }[] = [];
    setTelegramFetch(async (url, init) => {
      if (url.includes("sendMessage")) { risposte.push(JSON.parse(String(init?.body))); return Response.json({ ok: true, result: {} }); }
      if (url.includes("offset=")) { conferme.push(url); return Response.json({ ok: true, result: [] }); }
      return Response.json({ ok: true, result: [
        { update_id: 3, message: { chat: { id: 9 }, text: "/start inventato" } },
        { update_id: 4, message: { chat: { id: 10 }, text: "ciao" } },
      ] });
    });
    expect((await giroTelegram(env, 2000, 5))).toMatchObject({ collegati: 0, sottorichieste: 3 });
    expect(risposte).toHaveLength(1); // solo /start con un codice: un messaggio qualsiasi non ha risposta
    expect(risposte[0].chat_id).toBe("9");
    expect(risposte[0].text.startsWith("Codice non riconosciuto")).toBe(true);
    expect(conferme.some((u) => u.includes("offset=5"))).toBe(true);
  });

  it("una chat già collegata che ripete /start (conferma persa) non riceve \"Codice non riconosciuto\"", async () => {
    await collegaChat("diego", "55");
    await nuovoCodice(env.DB, "tommaso", 1000);
    const url: string[] = [];
    setTelegramFetch(async (u) => {
      url.push(u);
      if (u.includes("getUpdates") && !u.includes("offset=")) return Response.json({ ok: true, result: [{ update_id: 3, message: { chat: { id: 55 }, text: "/start vecchio" } }] });
      return Response.json({ ok: true, result: [] });
    });
    await giroTelegram(env, 2000, 5);
    expect(url.some((u) => u.includes("sendMessage"))).toBe(false);
  });

  it("la conferma a Telegram parte dopo la batch: se la scrittura fallisce il messaggio torna al giro dopo", async () => {
    const codice = await nuovoCodice(env.DB, "tommaso", 1000);
    let chatAllaConferma: unknown = "mai";
    setTelegramFetch(async (u) => {
      if (u.includes("offset=")) {
        chatAllaConferma = (await env.DB.prepare("SELECT telegram_chat_id AS chat FROM users WHERE id = 'tommaso'").first<{ chat: string | null }>())?.chat;
        return Response.json({ ok: true, result: [] });
      }
      return Response.json({ ok: true, result: [{ update_id: 7, message: { chat: { id: 4242 }, text: `/start ${codice}` } }] });
    });
    await giroTelegram(env, 2000, 5);
    expect(chatAllaConferma).toBe("4242");
  });

  it("con un limite di 2 e messaggi in coda vince il collegamento: il codice dura 15 minuti, l'avviso 6 ore", async () => {
    await collegaChat("tommaso", "4242");
    const codice = await nuovoCodice(env.DB, "diego", 1000);
    const db = getDb(env.DB);
    for (let i = 0; i < 2; i++) await avvisa(db, { evento: "lead_nuovo", entityId: `L${i}`, titolo: `Lead ${i}` }, 1000 + i, ["tommaso"]);
    setTelegramFetch(async (u) => {
      if (u.includes("getUpdates") && !u.includes("offset=")) return Response.json({ ok: true, result: [{ update_id: 1, message: { chat: { id: 99 }, text: `/start ${codice}` } }] });
      return Response.json({ ok: true, result: [] });
    });
    expect(await giroTelegram(env, 2000, 2)).toMatchObject({ collegati: 1, inviati: 0, sottorichieste: 2 });
    expect(await inCoda()).toBe(2);
  });

  it("con un limite di 1 vince il messaggio: il collegamento aspetta il giro dopo", async () => {
    await collegaChat("tommaso", "4242");
    await nuovoCodice(env.DB, "diego", 1000);
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L1", titolo: "Lead nuovo" }, 1000, ["tommaso"]);
    const url: string[] = [];
    setTelegramFetch(async (u) => { url.push(u); return Response.json({ ok: true, result: {} }); });
    const r = await giroTelegram(env, 2000, 1);
    expect(r).toMatchObject({ collegati: 0, inviati: 1, sottorichieste: 1 });
    expect(url.every((u) => u.includes("sendMessage"))).toBe(true);
  });

  it("Telegram che risponde male alla lettura non rompe il giro", async () => {
    await nuovoCodice(env.DB, "tommaso", 1000);
    setTelegramFetch(async () => new Response("giù", { status: 502 }));
    await expect(giroTelegram(env, 2000, 5)).resolves.toMatchObject({ collegati: 0 });
  });
});

describe("consegna", () => {
  it("solo i tre eventi, solo a chi ha la chat, in testo semplice", async () => {
    await collegaChat("tommaso", "4242");
    const db = getDb(env.DB);
    await avvisa(db, { evento: "lead_nuovo", entityId: "L1", titolo: "Lead nuovo: Officina <b>Prova</b>", href: "/commerciale/lead/L1" }, 1000);
    await avvisa(db, { evento: "meta_48h", entityId: "meta:x", titolo: "Meta muto" }, 1000);
    const corpi: { chat_id: string; text: string; parse_mode?: string }[] = [];
    setTelegramFetch(async (_u, init) => { corpi.push(JSON.parse(String(init!.body))); return Response.json({ ok: true, result: {} }); });
    const r = await giroTelegram(env, 2000, 5);
    expect(r.inviati).toBe(1);
    expect(corpi[0].chat_id).toBe("4242");
    expect(corpi[0].text).toContain("Officina <b>Prova</b>");
    expect(corpi[0].text).toContain("https://os.esempio.it/commerciale/lead/L1");
    expect(corpi[0].parse_mode).toBeUndefined();
    expect(await inCoda()).toBe(0); // diego non ha la chat: segnato e saltato
  });

  it("senza token resta tutto in coda", async () => {
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L2", titolo: "x" }, 1000);
    const r = await giroTelegram({ ...env, TELEGRAM_BOT_TOKEN: "" }, 2000, 5);
    expect(r.inviati).toBe(0);
    expect(await inCoda()).toBe(2);
  });

  it("un evento fuori dai tre non parte nemmeno se la riga è in coda", async () => {
    await collegaChat("tommaso", "4242");
    await env.DB.prepare("INSERT INTO notifications (id, chiave, user_id, evento, entity_id, titolo, created_at) VALUES ('n1', 'sla_90:P1:tommaso', 'tommaso', 'sla_90', 'P1', 'Tra 30 minuti', 1000)").run();
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return Response.json({ ok: true, result: {} }); });
    expect((await giroTelegram(env, 2000, 5)).inviati).toBe(0);
    expect(chiamate).toBe(0);
    expect(await inCoda()).toBe(0);
  });

  it("ore di silenzio e avviso spento per evento spengono anche Telegram", async () => {
    await collegaChat("tommaso", "4242");
    await collegaChat("diego", "4343");
    await env.DB.prepare("UPDATE users SET quiet_hours = ?1 WHERE id = 'tommaso'").bind(JSON.stringify({ attive: true, da: "22:00", a: "07:30" })).run();
    await env.DB.prepare("UPDATE users SET notify_prefs = ?1 WHERE id = 'diego'").bind(JSON.stringify({ sla_scaduto: false })).run();
    const notte = daRoma(2026, 10, 13, 23, 0);
    await avvisa(getDb(env.DB), { evento: "sla_scaduto", entityId: "L3", titolo: "Prima chiamata scaduta" }, notte);
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return Response.json({ ok: true, result: {} }); });
    const r = await giroTelegram(env, notte + 60_000, 5);
    expect(r.inviati).toBe(0);
    expect(chiamate).toBe(0);
    expect(await inCoda()).toBe(0); // in app l'avviso resta, il canale è spento
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE closed_at IS NULL").first<{ n: number }>())?.n).toBe(2);
  });

  it("già letto in app o più vecchio di 6 ore: non parte", async () => {
    await collegaChat("tommaso", "4242");
    const db = getDb(env.DB);
    await avvisa(db, { evento: "lead_nuovo", entityId: "L4", titolo: "Vecchio" }, 0, ["tommaso"]);
    await avvisa(db, { evento: "lead_nuovo", entityId: "L5", titolo: "Letto" }, 7 * 3_600_000, ["tommaso"]);
    await env.DB.prepare("UPDATE notifications SET read_at = 1 WHERE entity_id = 'L5'").run();
    await avvisa(db, { evento: "lead_nuovo", entityId: "L6", titolo: "Nuovo" }, 7 * 3_600_000, ["tommaso"]);
    const testi: string[] = [];
    setTelegramFetch(async (_u, init) => { testi.push(JSON.parse(String(init!.body)).text); return Response.json({ ok: true, result: {} }); });
    await giroTelegram(env, 7 * 3_600_000 + 60_000, 5);
    expect(testi).toEqual(["Nuovo"]);
    expect(await inCoda()).toBe(0);
  });

  it("Telegram giù (5xx) o occupato (429): l'avviso resta in coda; chat bloccata (403): segnato e chiuso", async () => {
    await collegaChat("tommaso", "4242");
    await collegaChat("diego", "4343");
    await avvisa(getDb(env.DB), { evento: "lead_nuovo", entityId: "L7", titolo: "x" }, 1000);
    setTelegramFetch(async (_u, init) => {
      const chat = JSON.parse(String(init!.body)).chat_id;
      return new Response("{}", { status: chat === "4242" ? 503 : 403 });
    });
    expect((await giroTelegram(env, 2000, 5)).inviati).toBe(0);
    const resta = await env.DB.prepare("SELECT user_id AS u FROM notifications WHERE telegram_at IS NULL").all<{ u: string }>();
    expect(resta.results).toEqual([{ u: "tommaso" }]);
    // 403: diego ha bloccato il bot, la sua chat si scollega.
    expect((await env.DB.prepare("SELECT telegram_chat_id AS c FROM users WHERE id = 'diego'").first<{ c: string | null }>())?.c).toBeNull();
    setTelegramFetch(async () => { throw new Error("rete giù"); });
    expect((await giroTelegram(env, 3000, 5)).inviati).toBe(0);
    expect(await inCoda()).toBe(1);
  });

  it("bot bloccato (403): gli altri avvisi della stessa persona nel giro non chiamano Telegram", async () => {
    await collegaChat("diego", "4343");
    const db = getDb(env.DB);
    for (let i = 0; i < 3; i++) await avvisa(db, { evento: "lead_nuovo", entityId: `B${i}`, titolo: `Lead ${i}` }, 1000 + i, ["diego"]);
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return new Response("{}", { status: 403 }); });
    expect(await giroTelegram(env, 2000, 5)).toMatchObject({ inviati: 0, sottorichieste: 1 });
    expect(chiamate).toBe(1);
    expect(await inCoda()).toBe(0);
  });

  for (const stato of [401, 404]) {
    it(`token non valido (${stato}): niente perso, stato rosso, di nuovo verde al primo invio riuscito`, async () => {
      await collegaChat("tommaso", "4242");
      const db = getDb(env.DB);
      for (let i = 0; i < 3; i++) await avvisa(db, { evento: "sla_scaduto", entityId: `K${i}`, titolo: `SLA ${i}` }, 1000 + i, ["tommaso"]);
      let chiamate = 0;
      setTelegramFetch(async () => { chiamate++; return new Response("{}", { status: stato }); });
      expect(await giroTelegram(env, 2000, 5)).toMatchObject({ inviati: 0, sottorichieste: 1 });
      expect(chiamate).toBe(1); // al primo rifiuto del token il giro si ferma
      expect(await inCoda()).toBe(3);
      expect((await env.DB.prepare("SELECT telegram_chat_id AS c FROM users WHERE id = 'tommaso'").first<{ c: string }>())?.c).toBe("4242");
      const cookie = await loginCookie("tommaso", "password-lunga-1");
      const leggi = async () => (await (await call("/api/integrations/status", {}, cookie)).json<{ integrazioni: { key: string; stato: string; nota: string | null }[] }>()).integrazioni.find((i) => i.key === "telegram");
      expect(await leggi()).toMatchObject({ stato: "errore", nota: "Token del bot non valido" });
      setTelegramFetch(async () => Response.json({ ok: true, result: {} }));
      // Limite pieno (3 messaggi su 3): il verde aspetta un giro con un'unità libera.
      expect((await giroTelegram(env, 3000, 3)).inviati).toBe(3);
      expect(await leggi()).toMatchObject({ stato: "errore" });
      await avvisa(db, { evento: "sla_scaduto", entityId: "K9", titolo: "SLA 9" }, 3500, ["tommaso"]);
      expect((await giroTelegram(env, 4000, 5)).inviati).toBe(1);
      expect(await leggi()).toMatchObject({ stato: "ok", nota: "1 chat collegata" });
    });
  }

  it("rispetta il limite: i messaggi in più partono al giro dopo", async () => {
    await collegaChat("tommaso", "4242");
    const db = getDb(env.DB);
    for (let i = 0; i < 4; i++) await avvisa(db, { evento: "lead_nuovo", entityId: `M${i}`, titolo: `Lead ${i}` }, 1000 + i, ["tommaso"]);
    let inviati = 0;
    setTelegramFetch(async () => { inviati++; return Response.json({ ok: true, result: {} }); });
    expect((await giroTelegram(env, 2000, 3)).inviati).toBe(3);
    expect(await inCoda()).toBe(1);
    expect((await giroTelegram(env, 3000, 3)).inviati).toBe(1);
    expect(inviati).toBe(4);
  });

  it("costo misurato: 2 query fisse più una a unità, una sottorichiesta a unità", async () => {
    await collegaChat("tommaso", "4242");
    await nuovoCodice(env.DB, "diego", 1000);
    const db = getDb(env.DB);
    for (let i = 0; i < 6; i++) await avvisa(db, { evento: "sla_scaduto", entityId: `S${i}`, titolo: `SLA ${i}` }, 1000 + i, ["tommaso"]);
    let sotto = 0;
    setTelegramFetch(async (u) => {
      sotto++;
      if (u.includes("getUpdates") && !u.includes("offset=")) return Response.json({ ok: true, result: [{ update_id: 1, message: { chat: { id: 77 }, text: "/start no" } }] });
      return Response.json({ ok: true, result: {} });
    });
    const c = { query: 0 };
    const r = await giroTelegram({ ...env, DB: contaD1(env.DB, c) }, 2000, 5);
    // getUpdates e conferma, la risposta al codice sbagliato, 2 messaggi.
    expect(r).toMatchObject({ inviati: 2, sottorichieste: 5 });
    expect(sotto).toBe(5);
    expect(c.query).toBeLessThanOrEqual(2 + 5);
    // Niente da fare: una lettura sola.
    const vuoto = { query: 0 };
    await env.DB.prepare("UPDATE notifications SET telegram_at = 1").run();
    await env.DB.prepare("UPDATE users SET telegram_codice = NULL").run();
    await giroTelegram({ ...env, DB: contaD1(env.DB, vuoto) }, 3000, 5);
    expect(vuoto.query).toBe(1);
  });
});

describe("rotte", () => {
  it("401 senza sessione", async () => {
    expect((await call("/api/integrations/telegram/collega", { method: "POST" })).status).toBe(401);
    expect((await call("/api/integrations/telegram/prova", { method: "POST" })).status).toBe(401);
    expect((await call("/api/integrations/telegram", { method: "DELETE" })).status).toBe(401);
  });

  it("collega restituisce il link del bot con il codice", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    const r = await (await call("/api/integrations/telegram/collega", { method: "POST" }, cookie)).json<{ link: string }>();
    expect(r.link).toMatch(/^https:\/\/t\.me\/acceleriamo_test_bot\?start=[A-Za-z0-9_-]{12,}$/);
    const codice = r.link.split("start=")[1];
    expect((await env.DB.prepare("SELECT telegram_codice AS c FROM users WHERE id = 'tommaso'").first<{ c: string }>())?.c).toBe(codice);
  });

  it("prova: 409 senza chat collegata, poi un messaggio in testo semplice", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    const senza = await call("/api/integrations/telegram/prova", { method: "POST" }, cookie);
    expect(senza.status).toBe(409);
    expect(await senza.json()).toEqual({ error: expect.any(String) });
    await collegaChat("tommaso", "4242");
    const corpi: { chat_id: string; parse_mode?: string }[] = [];
    setTelegramFetch(async (_u, init) => { corpi.push(JSON.parse(String(init!.body))); return Response.json({ ok: true, result: {} }); });
    const ok = await call("/api/integrations/telegram/prova", { method: "POST" }, cookie);
    expect(await ok.json()).toEqual({ ok: true });
    expect(corpi).toHaveLength(1);
    expect(corpi[0].chat_id).toBe("4242");
    expect(corpi[0].parse_mode).toBeUndefined();
  });

  it("prova: Telegram che rifiuta dà 502 con error", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    await collegaChat("tommaso", "4242");
    setTelegramFetch(async () => new Response("{}", { status: 400 }));
    const r = await call("/api/integrations/telegram/prova", { method: "POST" }, cookie);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: expect.any(String) });
  });

  it("scollega toglie la mia chat e il codice, non quella degli altri", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    await collegaChat("tommaso", "4242");
    await collegaChat("diego", "4343");
    await nuovoCodice(env.DB, "tommaso", Date.now());
    expect((await call("/api/integrations/telegram", { method: "DELETE" }, cookie)).status).toBe(200);
    const righe = await env.DB.prepare("SELECT id, telegram_chat_id AS chat, telegram_codice AS codice FROM users ORDER BY id").all();
    expect(righe.results).toEqual([{ id: "diego", chat: "4343", codice: null }, { id: "tommaso", chat: null, codice: null }]);
  });

  it("stato: collegato con il numero delle chat", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    await collegaChat("tommaso", "4242");
    const s = await (await call("/api/integrations/status", {}, cookie)).json<{ integrazioni: { key: string; stato: string; nota: string | null }[] }>();
    expect(s.integrazioni.find((i) => i.key === "telegram")).toMatchObject({ stato: "ok", nota: "1 chat collegata" });
  });

  it("senza token: stato Non collegato, collega e prova rispondono 409 con error, nessuna chiamata a Telegram", async () => {
    const cookie = await loginCookie("tommaso", "password-lunga-1");
    await collegaChat("tommaso", "4242");
    let chiamate = 0;
    setTelegramFetch(async () => { chiamate++; return Response.json({ ok: true, result: {} }); });
    const senza = { ...env, TELEGRAM_BOT_TOKEN: "" };
    const chiama = async (path: string, method = "GET") => {
      const ctx = createExecutionContext();
      const r = await app.fetch(new Request(`https://test.local${path}`, { method, headers: { cookie } }), senza, ctx);
      await waitOnExecutionContext(ctx);
      return r;
    };
    const s = await (await chiama("/api/integrations/status")).json<{ integrazioni: { key: string; stato: string; nota: string | null }[] }>();
    expect(s.integrazioni.find((i) => i.key === "telegram")).toMatchObject({ stato: "spento", nota: "Non collegato: manca il token del bot" });
    for (const p of ["/api/integrations/telegram/collega", "/api/integrations/telegram/prova"]) {
      const r = await chiama(p, "POST");
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: expect.any(String) });
    }
    expect(chiamate).toBe(0);
  });
});
