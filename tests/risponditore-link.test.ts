import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { computeMetaSignature } from "../worker/meta/signature";
import { setMetaFetch } from "../worker/meta/fetcher";
import { LAVORI } from "../worker/cron";
import { mandaLink } from "../worker/risponditore/link";
import { createUser } from "./helpers";
import { controllaScadenzaToken, rinnovaToken } from "../worker/risponditore/rinnovo";
import { leggiToken, salvaToken } from "../worker/risponditore/token";

const NOW = 1_800_000_000_000;
const GIORNO = 86_400_000;
const ENV = { ...env, APP_URL: "https://risorse.acceleriamo.it" };
type Chiamata = { url: string; corpo: any; auth: string | null };
let chiamate: Chiamata[] = [];
let risposta: (url: string) => Response;

beforeEach(async () => {
  await createUser();
  chiamate = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  risposta = () => Response.json({ message_id: "m" });
  setMetaFetch(async (url, init) => {
    chiamate.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("authorization") });
    return risposta(url);
  });
  await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 30 * GIORNO }, NOW - GIORNO);
  await env.DB.prepare(
    "INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES ('camp-1','Guida','casa',NULL,?, 'Ecco','Mandami il link','guida','Eccolo, e seguici!',1,?)",
  ).bind(JSON.stringify(["Ti scrivo!"]), NOW).run();
});
afterEach(() => {
  setMetaFetch(null);
  vi.restoreAllMocks();
});

const inserisci = (id: string, autore: string, stato: string, aggiornato: number) =>
  env.DB.prepare(
    "INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, tentativi, creato_il, aggiornato_il) VALUES (?, 'm1', ?, 'mario', 'CASA', 'camp-1', ?, 0, ?, ?)",
  ).bind(id, autore, stato, aggiornato, aggiornato).run();
const evento = (id: string) => env.DB.prepare("SELECT * FROM risp_eventi WHERE commento_id = ?").bind(id).first<Record<string, any>>();
const avvisi = () => env.DB.prepare("SELECT titolo, entity_id FROM notifications WHERE evento = 'risponditore_errore'").all<{ titolo: string; entity_id: string }>();

describe("mandaLink", () => {
  it("manda il link alla persona e porta l'evento più recente a link_inviato", async () => {
    await inserisci("c1", "p1", "inviato", NOW - 2000);
    await inserisci("c2", "p1", "inviato", NOW - 1000);
    await inserisci("c3", "p2", "inviato", NOW);
    await mandaLink(ENV, "p1", "camp-1", NOW + 5);
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].url).toBe("https://graph.instagram.com/v25.0/me/messages");
    expect(chiamate[0].auth).toBe("Bearer IGAA-segreto");
    expect(chiamate[0].corpo.recipient).toEqual({ id: "p1" });
    expect(chiamate[0].corpo.message.text).toBe("Eccolo, e seguici!\n\nhttps://risorse.acceleriamo.it/r/guida");
    expect(await evento("c2")).toMatchObject({ stato: "link_inviato", aggiornato_il: NOW + 5 });
    expect((await evento("c1"))?.stato).toBe("inviato");
    expect((await evento("c3"))?.stato).toBe("inviato");
  });

  it("un secondo tocco rimanda il link e lascia lo stato com'è", async () => {
    await inserisci("c1", "p1", "inviato", NOW);
    await mandaLink(ENV, "p1", "camp-1", NOW + 1);
    await mandaLink(ENV, "p1", "camp-1", NOW + 2);
    expect(chiamate).toHaveLength(2);
    expect((await evento("c1"))?.stato).toBe("link_inviato");
  });

  it("campagna sconosciuta o nessun evento: non parte nulla e non lancia", async () => {
    await inserisci("c1", "p1", "inviato", NOW);
    await expect(mandaLink(ENV, "p1", "non-esiste", NOW)).resolves.toBeUndefined();
    await expect(mandaLink(ENV, "sconosciuto", "camp-1", NOW)).resolves.toBeUndefined();
    expect(chiamate).toHaveLength(0);
  });

  it("se l'invio fallisce l'evento non cambia", async () => {
    await inserisci("c1", "p1", "inviato", NOW);
    risposta = () => Response.json({ error: { code: 10, message: "no" } }, { status: 400 });
    await mandaLink(ENV, "p1", "camp-1", NOW + 1);
    expect((await evento("c1"))?.stato).toBe("inviato");
  });

  it("webhook: il tocco su RISORSA:<id> manda il link", async () => {
    await inserisci("c1", "p1", "inviato", NOW);
    const raw = JSON.stringify({ object: "instagram", entry: [{ id: "1784", messaging: [{ sender: { id: "p1" }, postback: { payload: "RISORSA:camp-1" } }] }] });
    const headers = { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, "segreto-ig-test") };
    const { app } = await import("../worker/app");
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/webhooks/instagram", { method: "POST", body: raw, headers }), ENV, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].corpo.recipient).toEqual({ id: "p1" });
    expect(chiamate[0].corpo.message.text).toContain("https://risorse.acceleriamo.it/r/guida");
    expect((await evento("c1"))?.stato).toBe("link_inviato");
  });
});

describe("rinnovaToken", () => {
  it("salta il rinnovo se il token è stato salvato meno di 24 ore fa", async () => {
    await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 60 * GIORNO }, NOW - GIORNO / 2);
    await rinnovaToken(env, NOW);
    expect(chiamate).toHaveLength(0);
    expect((await avvisi()).results).toHaveLength(0);
  });

  it("rinnovo riuscito: nuovo token e nuova scadenza", async () => {
    risposta = () => Response.json({ access_token: "IGAA-nuovo", token_type: "bearer", expires_in: 5_184_000 });
    await rinnovaToken(env, NOW);
    expect(chiamate[0].url).toBe("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=IGAA-segreto");
    const t = await leggiToken(env);
    expect(t?.token).toBe("IGAA-nuovo");
    expect(t?.scadeIl).toBe(NOW + 5_184_000 * 1000);
    expect((await avvisi()).results).toHaveLength(0);
  });

  it("rinnovo fallito: token vecchio intatto, ultimoErrore e un solo avviso anche ripetendo", async () => {
    risposta = () => Response.json({ error: { code: 190, message: "Sessione scaduta" } }, { status: 400 });
    await rinnovaToken(env, NOW);
    await rinnovaToken(env, NOW + GIORNO);
    const t = await leggiToken(env);
    expect(t?.token).toBe("IGAA-segreto");
    expect(t?.scadeIl).toBe(NOW + 30 * GIORNO);
    const riga = await env.DB.prepare("SELECT ultimo_errore FROM ig_account WHERE id = 'principale'").first<{ ultimo_errore: string }>();
    expect(riga?.ultimo_errore).toContain("Sessione scaduta");
    expect(riga?.ultimo_errore).not.toContain("IGAA");
    const a = (await avvisi()).results;
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(a.map((x) => x.titolo))).toEqual(new Set(["Risponditore: accesso a Instagram da rinnovare"]));
    const dopoUno = a.length;
    await rinnovaToken(env, NOW + 2 * GIORNO);
    expect((await avvisi()).results).toHaveLength(dopoUno);
  });

  it("errore di rete: stesso trattamento, nessun token nei messaggi", async () => {
    setMetaFetch(async () => {
      throw new Error("fetch failed per https://graph.instagram.com/refresh_access_token?access_token=IGAA-segreto");
    });
    await rinnovaToken(env, NOW);
    const riga = await env.DB.prepare("SELECT ultimo_errore FROM ig_account WHERE id = 'principale'").first<{ ultimo_errore: string }>();
    expect(riga?.ultimo_errore).not.toContain("IGAA");
    expect((await avvisi()).results.length).toBeGreaterThan(0);
  });

  it("senza account collegato non fa nulla", async () => {
    await env.DB.prepare("DELETE FROM ig_account").run();
    await rinnovaToken(env, NOW);
    expect(chiamate).toHaveLength(0);
  });
});

describe("preavviso di scadenza", () => {
  it("token che scade tra 3 giorni: un solo avviso dopo due giri, senza chiamare il rinnovo", async () => {
    await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 3 * GIORNO }, NOW - 50 * GIORNO);
    await controllaScadenzaToken(env, NOW);
    await controllaScadenzaToken(env, NOW + 15 * 60_000);
    const a = (await avvisi()).results;
    expect(a).toHaveLength(1);
    expect(a[0].titolo).toBe("Risponditore: accesso a Instagram da rinnovare");
    expect(chiamate).toHaveLength(0);
  });
  it("se il preavviso lancia, il lavoro del risponditore ritenta comunque gli eventi in errore", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 3 * GIORNO }, NOW - 50 * GIORNO);
    await env.DB.prepare(
      "INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES ('ce','m1','p1','mario','CASA','camp-1','errore','x',1,?,?)",
    ).bind(NOW - 3_600_000, NOW - 3_600_000).run();
    const db = new Proxy(env.DB, {
      get(t, k) {
        if (k === "prepare") return (q: string) => { if (q.includes("SELECT scade_il")) throw new Error("D1 giù"); return t.prepare(q); };
        const v = (t as any)[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    await LAVORI.risponditore!.esegui({ ...env, DB: db } as any, NOW, 3);
    expect((await evento("ce"))?.stato).toBe("inviato");
  });
  it("token con più di 7 giorni: nessun avviso", async () => {
    await controllaScadenzaToken(env, NOW);
    expect((await avvisi()).results).toHaveLength(0);
  });
});

describe("lavoro ig_token", () => {
  it("gira alle 5:00 di Roma, non alle 5:05 né alle 6:00", () => {
    const d = LAVORI.ig_token!;
    const roma = (h: number, m: number) => ({ ore: h, minuti: m }) as any;
    expect(d.quando(roma(5, 0))).toBe(true);
    expect(d.quando(roma(5, 5))).toBe(false);
    expect(d.quando(roma(6, 0))).toBe(false);
    expect([d.fisse, d.perUnita, d.sottoPerUnita, d.max]).toEqual([2, 0, 1, 1]);
  });
});
