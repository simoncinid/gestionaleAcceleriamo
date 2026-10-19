import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setMetaFetch } from "../worker/meta/fetcher";
import { recuperaCommenti } from "../worker/risponditore/recupero";
import { giroRisponditore } from "../worker/risponditore/giro";
import { salvaToken } from "../worker/risponditore/token";

const NOW = 1_800_000_000_000;
const GIORNO = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace("Z", "+0000");
let chiamate: string[] = [];
let commentiPerPost: Record<string, any[]> = {};
let postRecenti: any[] = [];
let postErrore: string | null = null;

beforeEach(async () => {
  chiamate = [];
  commentiPerPost = {};
  postRecenti = [];
  postErrore = null;
  await env.DB.prepare("DELETE FROM risp_campagne").run();
  await env.DB.prepare("DELETE FROM risp_eventi").run();
  await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 60 * GIORNO }, NOW);
  setMetaFetch(async (url) => {
    const percorso = url.split("/v25.0")[1];
    chiamate.push(percorso);
    if (percorso.startsWith("/me/media")) return Response.json({ data: postRecenti });
    const m = percorso.match(/^\/([^/]+)\/comments/);
    if (m) {
      if (m[1] === postErrore) return Response.json({ error: { code: 1, message: "boom" } }, { status: 400 });
      return Response.json({ data: commentiPerPost[m[1]] ?? [] });
    }
    return Response.json({ id: "ok-1", message_id: "m" });
  });
});
afterEach(() => setMetaFetch(null));

async function campagna(id: string, mediaId: string | null, parola = "casa") {
  await env.DB.prepare(
    "INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES (?, 'Guida', ?, ?, ?, 'Ecco','Mandami','guida','Eccolo',1,?)",
  ).bind(id, parola, mediaId, JSON.stringify(["Ti scrivo!"]), NOW).run();
}
const graphComm = (id: string, testo: string, età = 1000, extra = {}) => ({ id, text: testo, from: { id: "persona-" + id, username: "u" + id }, timestamp: iso(NOW - età), ...extra });
const privati = () => chiamate.filter((c) => c === "/me/messages").length;

describe("recuperaCommenti", () => {
  it("un commento su Graph mai arrivato dal webhook viene trattato una volta sola", async () => {
    await campagna("c1", "m1");
    commentiPerPost.m1 = [graphComm("k1", "voglio la CASA")];
    expect(await recuperaCommenti(env, NOW, 3)).toMatchObject({ trovati: 1 });
    expect(chiamate[0]).toContain("/m1/comments?fields=id,text,from,username,parent_id,timestamp&limit=50");
    expect(privati()).toBe(1);
    const e = await env.DB.prepare("SELECT * FROM risp_eventi WHERE commento_id = 'k1'").first<any>();
    expect(e).toMatchObject({ stato: "inviato", autore_id: "persona-k1", autore_nome: "uk1", media_id: "m1", testo: "voglio la CASA" });
    chiamate = [];
    expect(await recuperaCommenti(env, NOW + 60_000, 3)).toMatchObject({ trovati: 0 });
    expect(privati()).toBe(0);
  });

  it("campagne generali: gli ultimi 3 post degli ultimi 7 giorni", async () => {
    await campagna("g", null);
    postRecenti = [
      { id: "p1", timestamp: iso(NOW - GIORNO) },
      { id: "p2", timestamp: iso(NOW - 8 * GIORNO) },
    ];
    commentiPerPost.p1 = [graphComm("a", "casa")];
    commentiPerPost.p2 = [graphComm("b", "casa")];
    await recuperaCommenti(env, NOW, 3);
    expect(chiamate[0]).toBe("/me/media?fields=id,timestamp&limit=3");
    expect(chiamate.some((c) => c.startsWith("/p1/comments"))).toBe(true);
    expect(chiamate.some((c) => c.startsWith("/p2/comments"))).toBe(false);
  });

  it("salta i commenti oltre i 7 giorni, le risposte e i commenti dell'account", async () => {
    await campagna("c1", "m1");
    commentiPerPost.m1 = [
      graphComm("vecchio", "casa", 8 * GIORNO),
      graphComm("risposta", "casa", 1000, { parent_id: "x" }),
      { id: "mio", text: "casa", from: { id: "1784", username: "acceleriamo" }, timestamp: iso(NOW - 1000) },
      graphComm("buono", "casa"),
    ];
    expect(await recuperaCommenti(env, NOW, 3)).toMatchObject({ trovati: 1 });
    const ids = (await env.DB.prepare("SELECT commento_id FROM risp_eventi").all<any>()).results.map((r) => r.commento_id);
    expect(ids).toEqual(["buono"]);
  });

  it("un errore su un post non ferma gli altri, e nessun token nei log", async () => {
    await campagna("c1", "m1");
    await campagna("c2", "m2", "prezzo");
    postErrore = "m1";
    commentiPerPost.m2 = [graphComm("z", "prezzo")];
    await recuperaCommenti(env, NOW, 3);
    expect(await env.DB.prepare("SELECT 1 FROM risp_eventi WHERE commento_id = 'z'").first()).toBeTruthy();
  });

  it("a rotazione: con maxPost 1 i giri successivi coprono post diversi", async () => {
    await campagna("c1", "m1");
    await campagna("c2", "m2", "prezzo");
    const visti = new Set<string>();
    for (let i = 0; i < 2; i++) {
      chiamate = [];
      await recuperaCommenti(env, NOW + i * 15 * 60_000, 1);
      for (const c of chiamate) visti.add(c.split("/")[1]);
    }
    expect([...visti].sort()).toEqual(["m1", "m2"]);
  });

  it("senza campagne attive o senza token non chiama Graph", async () => {
    expect(await recuperaCommenti(env, NOW, 3)).toMatchObject({ trovati: 0 });
    expect(chiamate).toEqual([]);
  });
});

describe("giroRisponditore con recupero", () => {
  it("dopo i ritentativi usa il budget che resta e conta le chiamate", async () => {
    await campagna("c1", "m1");
    commentiPerPost.m1 = [graphComm("k1", "casa")];
    const r = await giroRisponditore(env, NOW, 3);
    expect(r.ritentati).toBe(0);
    expect(r.sottorichieste).toBeGreaterThanOrEqual(3); // lettura commenti + risposta pubblica + privato
    expect(privati()).toBe(1);
  });

  it("senza budget non recupera", async () => {
    await campagna("c1", "m1");
    commentiPerPost.m1 = [graphComm("k1", "casa")];
    await giroRisponditore(env, NOW, 0);
    expect(chiamate).toEqual([]);
  });
});
