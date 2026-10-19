import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setMetaFetch } from "../worker/meta/fetcher";
import { trattaCommento } from "../worker/risponditore/commenti";
import { motivoErrore } from "../worker/risponditore/errori";
import { giroRisponditore } from "../worker/risponditore/giro";
import { salvaToken } from "../worker/risponditore/token";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
let chiamate: string[] = [];
let privato: (n: number) => Response;
let nPrivati = 0;

function graphFinto() {
  setMetaFetch(async (url) => {
    const percorso = url.split("/v25.0")[1];
    chiamate.push(percorso);
    if (percorso === "/me/messages") return privato(++nPrivati);
    return Response.json({ id: "ok-1" });
  });
}
// Il recupero dei commenti persi legge i post (/me/media): qui contano solo le chiamate dei ritentativi.
const senzaRecupero = () => chiamate.filter((c) => !c.startsWith("/me/media"));
const errMeta = (code: number, message = "boom") => Response.json({ error: { code, message } }, { status: 400 });

async function campagna() {
  await env.DB.prepare(
    "INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) VALUES ('camp-1','Guida','casa',NULL,?, 'Ecco','Mandami','guida','Eccolo',1,?)",
  ).bind(JSON.stringify(["Ti scrivo!"]), NOW).run();
}
const commento = (extra = {}) => ({ id: "c1", testo: "CASA", autoreId: "persona-1", autoreNome: "mario", mediaId: "m1", parentId: null, ...extra });
const evento = (id: string) => env.DB.prepare("SELECT * FROM risp_eventi WHERE commento_id = ?").bind(id).first<Record<string, any>>();
const avvisi = async () => (await env.DB.prepare("SELECT count(DISTINCT entity_id) n FROM notifications WHERE evento = 'risponditore_errore'").first<{ n: number }>())!.n;
const righeAvviso = async () => (await env.DB.prepare("SELECT titolo, href FROM notifications WHERE evento = 'risponditore_errore'").first<Record<string, string>>());

beforeEach(async () => {
  chiamate = [];
  nPrivati = 0;
  privato = () => Response.json({ message_id: "m" });
  graphFinto();
  await env.DB.prepare("DELETE FROM notifications").run();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, name, password_hash, active, failed_logins, created_at) VALUES ('u-ris','ris','Ris','x',1,0,0)").run();
  await salvaToken(env, { igUserId: "1784", username: "acceleriamo", token: "IGAA-segreto", scadeIl: NOW + 60 * 86_400_000 }, NOW);
});
afterEach(() => setMetaFetch(null));

describe("motivoErrore", () => {
  it("190: accesso scaduto, non ritentabile", () => {
    expect(motivoErrore(190, "x")).toEqual({ motivo: "accesso a Instagram scaduto", ritentabile: false });
  });
  it("4, 17, 32, 613: troppe richieste, ritentabile", () => {
    for (const c of [4, 17, 32, 613]) expect(motivoErrore(c, "x")).toEqual({ motivo: "troppe richieste, riprovo", ritentabile: true });
  });
  it("10, 551, 2018278: finestra chiusa, non ritentabile", () => {
    for (const c of [10, 551, 2018278]) expect(motivoErrore(c, "x")).toEqual({ motivo: "finestra dei 7 giorni chiusa o messaggi non consentiti", ritentabile: false });
  });
  it("null: rete, ritentabile", () => {
    expect(motivoErrore(null, "x")).toEqual({ motivo: "Instagram non risponde, riprovo", ritentabile: true });
  });
  it("altro: messaggio di Meta, ritentabile", () => {
    expect(motivoErrore(1, "Qualcosa")).toEqual({ motivo: "Qualcosa", ritentabile: true });
  });
});

describe("giroRisponditore", () => {
  it("un evento in errore 613 viene ritentato e passa a inviato", async () => {
    await campagna();
    privato = () => errMeta(613);
    expect(await trattaCommento(env, commento(), NOW)).toBe("errore");
    const e1 = await evento("c1");
    expect(e1).toMatchObject({ stato: "errore", motivo: "troppe richieste, riprovo", tentativi: 1 });
    privato = () => Response.json({ message_id: "m" });
    chiamate = [];
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 1 });
    expect(await evento("c1")).toMatchObject({ stato: "inviato", tentativi: 1 });
    expect(senzaRecupero()).toEqual(["/me/messages"]); // solo il passo 6
    expect(await avvisi()).toBe(0);
  });

  it("non ritenta prima di 10 minuti", async () => {
    await campagna();
    privato = () => errMeta(613);
    await trattaCommento(env, commento(), NOW);
    chiamate = [];
    expect(await giroRisponditore(env, NOW + 5 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(senzaRecupero()).toEqual([]);
  });

  it("dopo 3 fallimenti resta errore e nasce un solo avviso, anche ai giri dopo", async () => {
    await campagna();
    privato = () => errMeta(613);
    await trattaCommento(env, commento(), NOW);
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 1 });
    expect(await avvisi()).toBe(0);
    expect(await giroRisponditore(env, NOW + 22 * MIN, 3)).toMatchObject({ ritentati: 1 });
    expect(await evento("c1")).toMatchObject({ stato: "errore", tentativi: 3 });
    expect(await avvisi()).toBe(1);
    expect(await righeAvviso()).toEqual({ titolo: "Risponditore: messaggio non partito", href: "/automazioni/risponditore" });
    expect(await giroRisponditore(env, NOW + 40 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(await avvisi()).toBe(1);
    const n = (await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'risponditore_errore'").first<{ n: number }>())!.n;
    await giroRisponditore(env, NOW + 60 * MIN, 3);
    expect((await env.DB.prepare("SELECT count(*) n FROM notifications WHERE evento = 'risponditore_errore'").first<{ n: number }>())!.n).toBe(n);
  });

  it("190: avviso subito, non ritentabile", async () => {
    await campagna();
    privato = () => errMeta(190);
    await trattaCommento(env, commento(), NOW);
    expect(await evento("c1")).toMatchObject({ stato: "errore", motivo: "accesso a Instagram scaduto", tentativi: 1 });
    expect(await avvisi()).toBe(1);
    chiamate = [];
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(senzaRecupero()).toEqual([]);
    expect(await avvisi()).toBe(1);
  });

  it("finestra chiusa (10) non viene ritentata e non crea avviso", async () => {
    await campagna();
    privato = () => errMeta(10);
    await trattaCommento(env, commento(), NOW);
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(await avvisi()).toBe(0);
  });

  it("riprende un evento rimasto in_corso da oltre 10 minuti e lo conta come tentativo", async () => {
    await campagna();
    await env.DB.prepare(
      "INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, tentativi, creato_il, aggiornato_il) VALUES ('c1','m1','persona-1','mario','CASA','camp-1','in_corso',0,?,?)",
    ).bind(NOW, NOW).run();
    expect(await giroRisponditore(env, NOW + 5 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 1 });
    expect(await evento("c1")).toMatchObject({ stato: "inviato", tentativi: 1 });
  });

  it("salta l'evento se la stessa persona ha già un invio per campagna e post", async () => {
    await campagna();
    privato = () => errMeta(613);
    await trattaCommento(env, commento(), NOW);
    await env.DB.prepare(
      "INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, tentativi, creato_il, aggiornato_il) VALUES ('c2','m1','persona-1','mario','CASA','camp-1','inviato',0,?,?)",
    ).bind(NOW, NOW).run();
    privato = () => Response.json({ message_id: "m" });
    chiamate = [];
    expect(await giroRisponditore(env, NOW + 11 * MIN, 3)).toMatchObject({ ritentati: 0 });
    expect(senzaRecupero()).toEqual([]);
    expect(await evento("c1")).toMatchObject({ stato: "ignorato" });
  });

  it("rispetta il limite", async () => {
    await campagna();
    privato = () => errMeta(613);
    await trattaCommento(env, commento({ id: "c1", autoreId: "p1" }), NOW);
    await trattaCommento(env, commento({ id: "c2", autoreId: "p2" }), NOW);
    privato = () => Response.json({ message_id: "m" });
    expect(await giroRisponditore(env, NOW + 11 * MIN, 1)).toMatchObject({ ritentati: 1 });
  });
});
