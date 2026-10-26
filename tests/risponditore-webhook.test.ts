import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { computeMetaSignature } from "../worker/meta/signature";
import { setMetaFetch } from "../worker/meta/fetcher";
import { trattaCommento } from "../worker/risponditore/commenti";
import { salvaToken } from "../worker/risponditore/token";
import { call } from "./helpers";

const NOW = Date.now();
type Chiamata = { url: string; corpo: any; auth: string | null };
let chiamate: Chiamata[] = [];

function graphFinto(risposta: (url: string) => Response = () => Response.json({ id: "ok-1" })) {
  setMetaFetch(async (url, init) => {
    chiamate.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("authorization") });
    return risposta(url);
  });
}

async function campagna(extra: Partial<Record<string, unknown>> = {}) {
  const c = { id: "camp-1", nome: "Guida", parola: "casa", media_id: "m1" as string | null, rispostepubbliche: JSON.stringify(["Ti scrivo in privato!"]), testo_privato: "Ecco la guida", etichetta_pulsante: "Mandami il link", risorsa_slug: "guida", testo_link: "Eccolo", attiva: 1, creata_il: NOW, ...extra };
  await env.DB.prepare(
    "INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(c.id, c.nome, c.parola, c.media_id, c.rispostepubbliche, c.testo_privato, c.etichetta_pulsante, c.risorsa_slug, c.testo_link, c.attiva, c.creata_il).run();
}

const commento = (extra = {}) => ({ id: "c1", testo: "CASA", autoreId: "persona-1", autoreNome: "mario", mediaId: "m1", parentId: null, ...extra });
const evento = (id: string) => env.DB.prepare("SELECT * FROM risp_eventi WHERE commento_id = ?").bind(id).first<Record<string, any>>();
const urlsFinali = () => chiamate.map((c) => c.url.split("/v25.0")[1]);

function avviso(value: unknown, field = "comments") {
  return JSON.stringify({ object: "instagram", entry: [{ id: "1784", time: 1, changes: [{ field, value }] }] });
}
async function post(raw: string, secret?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-hub-signature-256"] = await computeMetaSignature(raw, secret);
  return call("/api/webhooks/instagram", { method: "POST", body: raw, headers });
}

beforeEach(async () => {
  chiamate = [];
  graphFinto();
  await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 60 * 86_400_000 }, NOW);
});
afterEach(() => setMetaFetch(null));

describe("webhook Instagram: verifica e firma", () => {
  it("GET con token giusto restituisce la challenge, sbagliato 403", async () => {
    const ok = await call("/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verifica-ig-test&hub.challenge=777");
    expect(await ok.text()).toBe("777");
    const ko = await call("/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=sbagliato&hub.challenge=777");
    expect(ko.status).toBe(403);
  });

  it("POST senza firma o con firma sbagliata: 401", async () => {
    const raw = avviso({ id: "c1", text: "CASA", from: { id: "p1" }, media: { id: "m1" } });
    expect((await post(raw)).status).toBe(401);
    expect((await post(raw, "altro")).status).toBe(401);
  });

  it("POST firmato con META_APP_SECRET o con IG_APP_SECRET è accettato", async () => {
    const raw = avviso({ id: "c1", text: "niente", from: { id: "p1" }, media: { id: "m1" } });
    expect((await post(raw, "segreto-test")).status).toBe(200);
    expect((await post(raw, "segreto-ig-test")).status).toBe(200);
  });

  it("l'avviso firmato arriva fino alle chiamate a Graph", async () => {
    await campagna();
    const res = await post(avviso({ id: "c9", text: "voglio la CASA", from: { id: "p9", username: "luca" }, media: { id: "m1" } }), "segreto-ig-test");
    expect(res.status).toBe(200);
    expect(urlsFinali()).toEqual(["/c9/replies", "/me/messages"]);
    expect((await evento("c9"))?.stato).toBe("inviato");
  });

  it("i messaggi (messaging) che non sono un tocco su RISORSA vengono ignorati", async () => {
    await campagna();
    const raw = JSON.stringify({ object: "instagram", entry: [{ id: "1", messaging: [{ postback: { payload: "ALTRO:camp-1" }, sender: { id: "p1" } }, { message: { text: "ciao" }, sender: { id: "p1" } }] }] });
    expect((await post(raw, "segreto-ig-test")).status).toBe(200);
    expect(chiamate).toHaveLength(0);
  });

  it("spazio demo: 200 e non scrive nulla", async () => {
    await campagna();
    const raw = avviso({ id: "c1", text: "CASA", from: { id: "p1" }, media: { id: "m1" } });
    const headers = { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, "segreto-ig-test") };
    const { app } = await import("../worker/app");
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://test.local/api/webhooks/instagram", { method: "POST", body: raw, headers }), { ...env, SPAZIO: "demo" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(chiamate).toHaveLength(0);
    expect(await evento("c1")).toBeNull();
  });
});

describe("trattaCommento", () => {
  it("commento CASA: risposta pubblica, messaggio privato col pulsante, stato inviato", async () => {
    await campagna();
    expect(await trattaCommento(env, commento(), NOW)).toBe("inviato");
    expect(urlsFinali()).toEqual(["/c1/replies", "/me/messages"]);
    expect(chiamate[0].corpo).toEqual({ message: "Ti scrivo in privato!" });
    expect(chiamate[0].auth).toBe("Bearer IGAA-segreto");
    expect(chiamate[1].corpo.recipient).toEqual({ comment_id: "c1" });
    expect(chiamate[1].corpo.message.attachment).toEqual({
      type: "template",
      payload: { template_type: "button", text: "Ecco la guida", buttons: [{ type: "postback", title: "Mandami il link", payload: "RISORSA:camp-1" }] },
    });
    const e = await evento("c1");
    expect(e).toMatchObject({ stato: "inviato", campagna_id: "camp-1", risposta_pubblica_id: "ok-1" });
  });

  it("lo stesso avviso due volte, anche insieme: un solo messaggio privato", async () => {
    await campagna();
    await Promise.all([trattaCommento(env, commento(), NOW), trattaCommento(env, commento(), NOW)]);
    await trattaCommento(env, commento(), NOW);
    expect(urlsFinali().filter((u) => u === "/me/messages")).toHaveLength(1);
  });

  it("account stesso, parent_id, senza autore: nessuna chiamata, nessuna eccezione", async () => {
    await campagna();
    await trattaCommento(env, commento({ autoreId: "1784" }), NOW);
    await trattaCommento(env, commento({ id: "c2", parentId: "c1" }), NOW);
    await trattaCommento(env, commento({ id: "c3", autoreId: null }), NOW);
    expect(chiamate).toHaveLength(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM risp_eventi").first<{ n: number }>())?.n).toBe(0);
  });

  it("nessuna parola chiave: ignorato", async () => {
    await campagna();
    expect(await trattaCommento(env, commento({ testo: "bello!" }), NOW)).toBe("ignorato");
    expect(chiamate).toHaveLength(0);
    expect(await evento("c1")).toMatchObject({ stato: "ignorato", motivo: "nessuna parola chiave" });
  });

  it("stessa persona due volte sullo stesso post: un solo privato, il secondo ignorato", async () => {
    await campagna();
    await trattaCommento(env, commento(), NOW);
    expect(await trattaCommento(env, commento({ id: "c2" }), NOW + 1)).toBe("ignorato");
    expect(urlsFinali().filter((u) => u === "/me/messages")).toHaveLength(1);
    expect(await evento("c2")).toMatchObject({ stato: "ignorato", motivo: "già risposto a questa persona" });
  });

  it("errore sulla risposta pubblica: si va avanti col privato e il motivo lo annota", async () => {
    await campagna();
    setMetaFetch(async (url) => {
      chiamate.push({ url, corpo: null, auth: null });
      return url.endsWith("/replies") ? Response.json({ error: { message: "Troppe risposte", code: 4 } }, { status: 400 }) : Response.json({ message_id: "m" });
    });
    expect(await trattaCommento(env, commento(), NOW)).toBe("inviato");
    expect(urlsFinali()).toEqual(["/c1/replies", "/me/messages"]);
    expect((await evento("c1"))?.motivo).toContain("Troppe risposte");
  });

  it("errore sul privato: stato errore, tentativi 1, motivo in italiano", async () => {
    await campagna();
    setMetaFetch(async (url) =>
      url.endsWith("/replies") ? Response.json({ id: "r" }) : Response.json({ error: { message: "Finestra scaduta", code: 10 } }, { status: 400 }),
    );
    expect(await trattaCommento(env, commento(), NOW)).toBe("errore");
    expect(await evento("c1")).toMatchObject({ stato: "errore", tentativi: 1, motivo: "finestra dei 7 giorni chiusa o messaggi non consentiti" });
  });

  it("eccezione dopo l'inserimento: l'evento non resta in_corso (varianti malformate e privato che lancia)", async () => {
    await campagna({ rispostepubbliche: '{"non":"un array"}' });
    setMetaFetch(async (url) => {
      chiamate.push({ url, corpo: null, auth: null });
      if (url.endsWith("/me/messages")) throw new Error("rete caduta");
      return Response.json({ id: "r" });
    });
    expect(await trattaCommento(env, commento(), NOW)).toBe("errore");
    expect(urlsFinali()).toEqual(["/me/messages"]);
    expect(await evento("c1")).toMatchObject({ stato: "errore", tentativi: 1, motivo: "Instagram non risponde, riprovo" });
  });

  it("eccezione vera nei passi 3-7 (D1 che lancia): stato errore, non in_corso", async () => {
    await campagna();
    const db = new Proxy(env.DB, {
      get(t, k) {
        if (k === "prepare") return (q: string) => (q.includes("SELECT 1 FROM risp_eventi") ? { bind: () => { throw new Error("D1 non risponde"); } } : t.prepare(q));
        const v = (t as any)[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    expect(await trattaCommento({ ...env, DB: db as D1Database }, commento(), NOW)).toBe("errore");
    expect(await evento("c1")).toMatchObject({ stato: "errore", tentativi: 1, motivo: "D1 non risponde" });
    expect(chiamate).toHaveLength(0);
  });
});

describe("campagna senza post legato: risponde solo dove la didascalia chiede la parola", () => {
  const conDidascalia = (caption: string | null) =>
    graphFinto((url) => (url.includes("?fields=caption") ? (caption === null ? Response.json({ error: { code: 1, message: "giù" } }, { status: 500 }) : Response.json({ id: "m1", caption })) : Response.json({ id: "ok-1" })));

  it("didascalia con \"Commenta CASA\": parte tutto; il secondo commento sullo stesso post non rilegge la didascalia", async () => {
    await campagna({ media_id: null });
    conDidascalia("Le richieste dei portali all'agente giusto. Commenta CASA e ti mandiamo lo schema.");
    expect(await trattaCommento(env, commento(), NOW)).toBe("inviato");
    expect(urlsFinali()).toEqual(["/m1?fields=caption", "/c1/replies", "/me/messages"]);
    chiamate = [];
    expect(await trattaCommento(env, commento({ id: "c2", autoreId: "persona-2" }), NOW + 1)).toBe("inviato");
    expect(urlsFinali()).toEqual(["/c2/replies", "/me/messages"]);
  });

  it("\"tra due ore\" sotto un post che non chiede ORE: nessuna risposta, nessun messaggio, motivo scritto", async () => {
    await campagna({ media_id: null, parola: "ore" });
    conDidascalia("Il nostro nuovo ufficio. Commenta TEMPO e ti mandiamo lo schema.");
    expect(await trattaCommento(env, commento({ testo: "ci sentiamo tra due ore" }), NOW)).toBe("ignorato");
    expect(urlsFinali()).toEqual(["/m1?fields=caption"]);
    expect(await evento("c1")).toMatchObject({ stato: "ignorato", campagna_id: "camp-1", motivo: "parola non chiesta nella didascalia di questo post" });
    chiamate = [];
    expect(await trattaCommento(env, commento({ id: "c2", autoreId: "persona-2", testo: "ORE" }), NOW + 1)).toBe("ignorato");
    expect(chiamate).toHaveLength(0); // la risposta di prima vale per tutto il post
  });

  it("parola solo nominata nella didascalia (senza \"Commenta\"): non basta", async () => {
    await campagna({ media_id: null, parola: "ore" });
    conDidascalia("Abbiamo risparmiato tre ore a settimana. Commenta TEMPO.");
    expect(await trattaCommento(env, commento({ testo: "ore" }), NOW)).toBe("ignorato");
  });

  it("didascalia non leggibile: errore senza invii; il giro riprova e, se la didascalia conferma, manda", async () => {
    await campagna({ media_id: null });
    conDidascalia(null);
    expect(await trattaCommento(env, commento(), NOW)).toBe("errore");
    expect(urlsFinali()).toEqual(["/m1?fields=caption"]);
    expect((await evento("c1"))?.motivo).toContain("Didascalia del post non leggibile");
    conDidascalia("Commenta CASA e ti mandiamo lo schema");
    chiamate = [];
    const { giroRisponditore } = await import("../worker/risponditore/giro");
    expect(await giroRisponditore(env, NOW + 11 * 60_000, 3)).toMatchObject({ ritentati: 1 });
    expect(urlsFinali().filter((u) => !u.startsWith("/me/media"))).toEqual(["/m1?fields=caption", "/me/messages"]);
    expect((await evento("c1"))?.stato).toBe("inviato");
  });

  it("campagna legata al post: nessuna lettura della didascalia", async () => {
    await campagna();
    conDidascalia(null);
    expect(await trattaCommento(env, commento(), NOW)).toBe("inviato");
    expect(urlsFinali()).toEqual(["/c1/replies", "/me/messages"]);
  });
});
