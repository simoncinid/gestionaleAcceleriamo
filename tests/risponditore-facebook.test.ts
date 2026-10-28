import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { computeMetaSignature } from "../worker/meta/signature";
import { setMetaFetch } from "../worker/meta/fetcher";
import { trattaCommento } from "../worker/risponditore/commenti";
import { giroRisponditore } from "../worker/risponditore/giro";
import { mandaLink } from "../worker/risponditore/link";
import { recuperaCommenti } from "../worker/risponditore/recupero";
import { salvaToken } from "../worker/risponditore/token";
import { VOCE_WEBHOOK_META } from "../worker/stato/voci";

const NOW = 1_800_000_000_000;
const GIORNO = 86_400_000;
const MIN = 60_000;
const PAGINA = "1217893964750759";
const POST = `${PAGINA}_555`;
// La Pagina collegata: token di Pagina (dal vitest.config) e id della Pagina.
const ENV = { ...env, META_PAGE_ID: PAGINA, APP_URL: "https://risorse.acceleriamo.it" };
const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "+0000");

type Chiamata = { url: string; metodo: string; corpo: any; auth: string | null };
let chiamate: Chiamata[] = [];
let risposta: (url: string, metodo: string) => Response;

beforeEach(async () => {
  chiamate = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  risposta = () => Response.json({ id: "ok-1", message_id: "m" });
  setMetaFetch(async (url, init) => {
    const metodo = init?.method ?? "GET";
    // Il testo del post (campagna senza post legato): dice "Commenta CASA", non conta tra le chiamate.
    if (url.endsWith("?fields=message")) return Response.json({ message: "Commenta CASA e ti mandiamo la guida" });
    chiamate.push({ url, metodo, corpo: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("authorization") });
    return risposta(url, metodo);
  });
  await env.DB.prepare("DELETE FROM risp_campagne").run();
  await env.DB.prepare("DELETE FROM risp_eventi").run();
  await env.DB.prepare(
    "INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES ('camp-1','Guida','casa',NULL,?, 'Ecco la guida','Mandami il link','guida','Eccolo',1,?)",
  ).bind(JSON.stringify(["Ti scrivo in privato!"]), NOW).run();
});
afterEach(() => {
  setMetaFetch(null);
  vi.restoreAllMocks();
});

const fb = (extra = {}) => ({ id: `${POST}_1`, testo: "CASA", autoreId: "persona-fb", autoreNome: "Mario Rossi", mediaId: POST, parentId: null, piattaforma: "fb" as const, ...extra });
const evento = (id: string) => env.DB.prepare("SELECT * FROM risp_eventi WHERE commento_id = ?").bind(id).first<Record<string, any>>();
const percorsi = () => chiamate.map((c) => c.url.replace(/^https:\/\/graph\.facebook\.com\/v23\.0/, ""));
const privati = () => percorsi().filter((p) => p === `/${PAGINA}/messages`).length;

async function postMeta(corpo: unknown, e: Record<string, unknown> = ENV) {
  const raw = JSON.stringify(corpo);
  const headers = { "content-type": "application/json", "x-hub-signature-256": await computeMetaSignature(raw, "segreto-test") };
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request("https://test.local/api/webhooks/meta", { method: "POST", body: raw, headers }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const feed = (value: Record<string, unknown>) => ({ object: "page", entry: [{ id: PAGINA, time: 1, changes: [{ field: "feed", value }] }] });
const commentoFeed = (extra: Record<string, unknown> = {}) => ({
  item: "comment", verb: "add", comment_id: `${POST}_9`, post_id: POST, parent_id: POST, message: "voglio la CASA",
  from: { id: "persona-9", name: "Luca Bianchi" }, created_time: 1, ...extra,
});

describe("trattaCommento su Facebook", () => {
  it("commento con parola: risposta pubblica e privato su Messenger da graph.facebook.com, stato inviato, piattaforma fb", async () => {
    expect(await trattaCommento(ENV, fb(), NOW)).toBe("inviato");
    expect(chiamate.every((c) => c.url.startsWith("https://graph.facebook.com/v23.0/"))).toBe(true);
    expect(percorsi()).toEqual([`/${POST}_1/comments`, `/${PAGINA}/messages`]);
    expect(chiamate[0].corpo).toEqual({ message: "Ti scrivo in privato!" });
    expect(chiamate[0].auth).toBe("Bearer token-test");
    expect(chiamate[1].corpo.recipient).toEqual({ comment_id: `${POST}_1` });
    expect(chiamate[1].corpo.message.attachment).toEqual({
      type: "template",
      payload: { template_type: "button", text: "Ecco la guida", buttons: [{ type: "postback", title: "Mandami il link", payload: `RISORSA:camp-1:${POST}_1` }] },
    });
    expect(await evento(`${POST}_1`)).toMatchObject({ stato: "inviato", piattaforma: "fb", campagna_id: "camp-1", media_id: POST, risposta_pubblica_id: "ok-1" });
  });

  it("commento della Pagina stessa: ignorato senza chiamate", async () => {
    expect(await trattaCommento(ENV, fb({ autoreId: PAGINA }), NOW)).toBe("ignorato");
    expect(chiamate).toHaveLength(0);
    expect(await evento(`${POST}_1`)).toBeNull();
  });

  it("lo stesso avviso due volte: un solo privato", async () => {
    await Promise.all([trattaCommento(ENV, fb(), NOW), trattaCommento(ENV, fb(), NOW)]);
    await trattaCommento(ENV, fb(), NOW + 1);
    expect(privati()).toBe(1);
  });

  it("Pagina non collegata (manca l'id o il token): errore non ritentabile, nessuna chiamata", async () => {
    expect(await trattaCommento({ ...env }, fb(), NOW)).toBe("errore");
    expect(await trattaCommento({ ...ENV, META_PAGE_TOKEN: "" }, fb({ id: "altro" }), NOW)).toBe("errore");
    expect(chiamate).toHaveLength(0);
    expect(await evento(`${POST}_1`)).toMatchObject({ stato: "errore", motivo: "Pagina Facebook non collegata", piattaforma: "fb" });
    expect(await giroRisponditore(ENV, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(privati()).toBe(0);
  });
});

describe("webhook della Pagina: commenti e tocchi", () => {
  it("commento diretto (parent_id = post_id) trattato, risposta in thread e commento della Pagina no", async () => {
    const raw = {
      object: "page",
      entry: [{
        id: PAGINA, time: 1,
        changes: [
          { field: "feed", value: commentoFeed() },
          { field: "feed", value: commentoFeed({ comment_id: `${POST}_10`, parent_id: `${POST}_9`, from: { id: "persona-10", name: "Anna" } }) },
          { field: "feed", value: commentoFeed({ comment_id: `${POST}_11`, from: { id: PAGINA, name: "Acceleriamo" } }) },
          { field: "feed", value: commentoFeed({ comment_id: `${POST}_12`, verb: "edited" }) },
          { field: "feed", value: { item: "reaction", verb: "add", post_id: POST, from: { id: "persona-13" } } },
        ],
      }],
    };
    const res = await postMeta(raw);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 0 });
    expect(await evento(`${POST}_9`)).toMatchObject({ stato: "inviato", piattaforma: "fb", autore_id: "persona-9", autore_nome: "Luca Bianchi", media_id: POST, testo: "voglio la CASA" });
    for (const id of ["10", "11", "12"]) expect(await evento(`${POST}_${id}`)).toBeNull();
    expect(percorsi()).toEqual([`/${POST}_9/comments`, `/${PAGINA}/messages`]);
  });

  it("commento senza autore (Facebook a volte non manda from): trattato lo stesso, l'autore diventa il commento", async () => {
    const { from: _, ...senzaAutore } = commentoFeed() as Record<string, unknown>;
    const res = await postMeta(feed(senzaAutore));
    expect(res.status).toBe(200);
    expect(await evento(`${POST}_9`)).toMatchObject({ stato: "inviato", piattaforma: "fb", autore_id: `commento:${POST}_9` });
    expect(privati()).toBe(1);
  });

  it("tocco sul pulsante: link al PSID da graph.facebook.com e link_inviato sull'evento del commento", async () => {
    await trattaCommento(ENV, fb({ id: `${POST}_1`, autoreId: "persona-fb" }), NOW - 2000);
    await trattaCommento(ENV, fb({ id: `${POST}_2`, autoreId: "altra", mediaId: `${PAGINA}_777` }), NOW - 1000);
    chiamate = [];
    const raw = { object: "page", entry: [{ id: PAGINA, time: 1, messaging: [{ sender: { id: "psid-42" }, recipient: { id: PAGINA }, timestamp: 1, postback: { title: "Mandami il link", payload: `RISORSA:camp-1:${POST}_1` } }] }] };
    expect((await postMeta(raw)).status).toBe(200);
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].url).toBe(`https://graph.facebook.com/v23.0/${PAGINA}/messages`);
    expect(chiamate[0].auth).toBe("Bearer token-test");
    expect(chiamate[0].corpo.recipient).toEqual({ id: "psid-42" });
    expect(chiamate[0].corpo.message.attachment.payload.elements[0].default_action.url).toBe("https://risorse.acceleriamo.it/r/guida");
    expect(await evento(`${POST}_1`)).toMatchObject({ stato: "link_inviato" });
    expect(await evento(`${POST}_2`)).toMatchObject({ stato: "inviato" });
  });

  it("tocco Facebook su un commento Instagram con lo stesso id: non parte nulla", async () => {
    await env.DB.prepare(
      "INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, tentativi, creato_il, aggiornato_il) VALUES ('c-ig', 'm1', 'p1', 'mario', 'CASA', 'camp-1', 'inviato', 0, ?, ?)",
    ).bind(NOW, NOW).run();
    await mandaLink(ENV, "psid-1", "camp-1", NOW, { piattaforma: "fb", commentoId: "c-ig" });
    expect(chiamate).toHaveLength(0);
    expect(await evento("c-ig")).toMatchObject({ stato: "inviato" });
  });

  it("spazio demo: commenti della Pagina senza chiamate né eventi", async () => {
    const res = await postMeta(feed(commentoFeed()), { ...ENV, SPAZIO: "demo" });
    expect(res.status).toBe(200);
    expect(chiamate).toHaveLength(0);
    expect(await evento(`${POST}_9`)).toBeNull();
  });

  it("un leadgen si comporta come prima: stessa risposta, lead creato, Stato scritto, nessun lavoro del risponditore", async () => {
    risposta = () => Response.json({ field_data: [{ name: "full_name", values: ["Mario Rossi"] }], form_id: "form-1" });
    const res = await postMeta({ object: "page", entry: [{ id: PAGINA, time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "LFB1", form_id: "form-1", page_id: PAGINA } }] }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 1 });
    expect(await env.DB.prepare("SELECT 1 FROM leads WHERE meta_lead_id = 'LFB1'").first()).toBeTruthy();
    const voce = await env.DB.prepare("SELECT ultimo_esito FROM stato_voci WHERE id = ?").bind(VOCE_WEBHOOK_META).first<{ ultimo_esito: string }>();
    expect(voce?.ultimo_esito).toBe("ok");
    expect(chiamate.every((c) => c.url.includes("/LFB1"))).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM risp_eventi").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("ritentativi e recupero su Facebook", () => {
  it("un evento fb in errore si ritenta su graph.facebook.com con il payload col commento", async () => {
    risposta = (url) => (url.endsWith("/messages") ? Response.json({ error: { code: 613, message: "lento" } }, { status: 400 }) : Response.json({ id: "ok-1" }));
    expect(await trattaCommento(ENV, fb(), NOW)).toBe("errore");
    risposta = () => Response.json({ message_id: "m" });
    chiamate = [];
    expect(await giroRisponditore(ENV, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 1 });
    const priv = chiamate.find((c) => c.metodo === "POST")!;
    expect(priv.url).toBe(`https://graph.facebook.com/v23.0/${PAGINA}/messages`);
    expect(priv.corpo.message.attachment.payload.buttons[0].payload).toBe(`RISORSA:camp-1:${POST}_1`);
    expect(await evento(`${POST}_1`)).toMatchObject({ stato: "inviato", piattaforma: "fb" });
  });

  it("recupero: un commento perso sulla Pagina trattato una volta sola", async () => {
    risposta = (url, metodo) => {
      if (metodo === "POST") return Response.json({ id: "ok-1", message_id: "m" });
      if (url.includes(`/${PAGINA}/published_posts`)) return Response.json({ data: [{ id: POST, created_time: iso(NOW - GIORNO) }, { id: `${PAGINA}_vecchio`, created_time: iso(NOW - 8 * GIORNO) }] });
      if (url.includes(`/${POST}/comments`)) {
        return Response.json({ data: [
          { id: `${POST}_k1`, message: "voglio la CASA", from: { id: "persona-k1", name: "Carla" }, created_time: iso(NOW - 1000) },
          { id: `${POST}_k2`, message: "casa", from: { id: PAGINA, name: "Acceleriamo" }, created_time: iso(NOW - 1000) },
          { id: `${POST}_k3`, message: "casa", from: { id: "persona-k3" }, parent: { id: `${POST}_k1` }, created_time: iso(NOW - 1000) },
        ] });
      }
      return Response.json({ data: [] });
    };
    expect(await recuperaCommenti(ENV, NOW, 3)).toMatchObject({ trovati: 1 });
    expect(percorsi()).toContain(`/${PAGINA}/published_posts?fields=id,created_time&limit=3`);
    expect(percorsi()).toContain(`/${POST}/comments?fields=id,message,from,parent,created_time&limit=50`);
    expect(percorsi().some((p) => p.startsWith(`/${PAGINA}_vecchio/`))).toBe(false);
    expect(await evento(`${POST}_k1`)).toMatchObject({ stato: "inviato", piattaforma: "fb", autore_id: "persona-k1", autore_nome: "Carla", media_id: POST });
    expect(await evento(`${POST}_k2`)).toBeNull();
    expect(await evento(`${POST}_k3`)).toBeNull();
    expect(privati()).toBe(1);
    chiamate = [];
    expect(await recuperaCommenti(ENV, NOW + MIN, 3)).toMatchObject({ trovati: 0 });
    expect(privati()).toBe(0);
  });
});
