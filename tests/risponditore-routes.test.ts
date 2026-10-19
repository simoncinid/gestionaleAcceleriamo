import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { setMetaFetch } from "../worker/meta/fetcher";
import { leggiToken } from "../worker/risponditore/token";
import { authed, call } from "./helpers";

const NOW = 1_800_000_000_000;
let cookie = "";

const campagna = (extra: Record<string, unknown> = {}) => ({
  nome: "Guida casa",
  parola: "Casa",
  mediaId: null,
  rispostePubbliche: ["Ti ho scritto in privato"],
  testoPrivato: "Ciao, ecco la guida",
  etichettaPulsante: "Mandami il link",
  risorsaSlug: "guida",
  testoLink: "Eccola",
  attiva: true,
  ...extra,
});
const crea = (json: unknown) => call("/api/risponditore/campagne", { method: "POST", json }, cookie);

async function evento(commentoId: string, stato: string, motivo: string | null, campagnaId: string | null, creatoIl: number) {
  await env.DB.prepare("INSERT INTO risp_eventi (commento_id, media_id, autore_id, autore_nome, testo, campagna_id, stato, motivo, tentativi, creato_il, aggiornato_il) VALUES (?,?,?,?,?,?,?,?,0,?,?)")
    .bind(commentoId, "m1", `a-${commentoId}`, `utente_${commentoId}`, "Voglio la guida casa", campagnaId, stato, motivo, creatoIl, creatoIl).run();
}

beforeEach(async () => {
  cookie = await authed();
  await env.DB.prepare("INSERT INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES ('guida','La guida','Sotto','Corpo',NULL,1,?)").bind(NOW).run();
});
afterEach(() => setMetaFetch(null));

describe("risponditore: accesso", () => {
  it("senza sessione: 401 su lettura e scritture", async () => {
    expect((await call("/api/risponditore")).status).toBe(401);
    expect((await call("/api/risponditore/campagne", { method: "POST", json: campagna() })).status).toBe(401);
    expect((await call("/api/risponditore/account", { method: "POST", json: { token: "x" } })).status).toBe(401);
    expect((await call("/api/risponditore/risorse/guida", { method: "PUT", json: {} })).status).toBe(401);
  });
});

describe("risponditore: campagne", () => {
  it("creata: parola normalizzata, risposte come elenco", async () => {
    const res = await crea(campagna());
    expect(res.status).toBe(201);
    const { campagna: c } = await res.json<{ campagna: Record<string, unknown> }>();
    expect(c).toMatchObject({ nome: "Guida casa", parola: "casa", mediaId: null, rispostePubbliche: ["Ti ho scritto in privato"], attiva: true });
    const riga = await env.DB.prepare("SELECT parola, rispostepubbliche FROM risp_campagne").first<{ parola: string; rispostepubbliche: string }>();
    expect(riga).toEqual({ parola: "casa", rispostepubbliche: JSON.stringify(["Ti ho scritto in privato"]) });
  });
  it("senza risposte pubbliche: 400", async () => {
    for (const r of [[], ["  "]]) {
      const res = await crea(campagna({ rispostePubbliche: r }));
      expect(res.status).toBe(400);
      expect((await res.json<{ error: string }>()).error).toMatch(/risposta pubblica/i);
    }
  });
  it("parola vuota o risorsa inesistente: 400", async () => {
    expect((await crea(campagna({ parola: " !! " }))).status).toBe(400);
    const res = await crea(campagna({ risorsaSlug: "non-esiste" }));
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toMatch(/risorsa/i);
  });
  it("parola doppia tra le attive con lo stesso post: 409, anche con maiuscole diverse", async () => {
    expect((await crea(campagna())).status).toBe(201);
    const res = await crea(campagna({ nome: "Altra", parola: "casa" }));
    expect(res.status).toBe(409);
    expect((await res.json<{ error: string }>()).error).toMatch(/parola/i);
    // Su un altro post o spenta la stessa parola va bene.
    expect((await crea(campagna({ mediaId: "m9" }))).status).toBe(201);
    expect((await crea(campagna({ attiva: false }))).status).toBe(201);
  });
  it("modifica: 200, la stessa campagna non collide con se stessa, 404 se non c'è", async () => {
    const { campagna: c } = await (await crea(campagna())).json<{ campagna: { id: string } }>();
    const res = await call(`/api/risponditore/campagne/${c.id}`, { method: "PUT", json: campagna({ nome: "Rinominata", attiva: false }) }, cookie);
    expect(res.status).toBe(200);
    expect((await res.json<{ campagna: Record<string, unknown> }>()).campagna).toMatchObject({ nome: "Rinominata", attiva: false });
    expect((await call("/api/risponditore/campagne/nessuna", { method: "PUT", json: campagna() }, cookie)).status).toBe(404);
  });
  it("riaccesa con una parola già attiva sullo stesso post: 409", async () => {
    await crea(campagna());
    const { campagna: spenta } = await (await crea(campagna({ attiva: false }))).json<{ campagna: { id: string } }>();
    const res = await call(`/api/risponditore/campagne/${spenta.id}`, { method: "PUT", json: campagna({ parola: "CASA" }) }, cookie);
    expect(res.status).toBe(409);
  });
});

describe("risponditore: elenco", () => {
  it("account senza token, campagne, eventi con motivi e parola, richieste", async () => {
    await env.DB.prepare("INSERT INTO ig_account (id, ig_user_id, username, token_cifrato, scade_il, rinnovato_il, ultimo_errore) VALUES ('principale','17','acceleriamo','SEGRETO',?,?,?)")
      .bind(NOW + 40 * 86_400_000, NOW, "accesso a Instagram scaduto").run();
    const { campagna: c } = await (await crea(campagna())).json<{ campagna: { id: string } }>();
    await evento("c1", "inviato", null, c.id, NOW);
    await evento("c2", "errore", "finestra dei 7 giorni chiusa o messaggi non consentiti", c.id, NOW + 1);
    await evento("c3", "ignorato", "nessuna parola", null, NOW + 2);
    await env.DB.prepare("INSERT INTO risorse_richieste (id, slug, nome, azienda, telefono, messaggio, creata_il) VALUES ('r1','guida','Mario','Rossi Srl','3331234567',NULL,?)").bind(NOW).run();

    const res = await call("/api/risponditore", {}, cookie);
    expect(res.status).toBe(200);
    const testo = await res.clone().text();
    expect(testo).not.toContain("SEGRETO");
    const d = await res.json<any>();
    expect(d.account).toEqual({ username: "acceleriamo", scadeIl: NOW + 40 * 86_400_000, ultimoErrore: "accesso a Instagram scaduto" });
    expect(d.campagne).toHaveLength(1);
    expect(d.eventi.map((e: any) => [e.commentoId, e.stato, e.motivo, e.parola])).toEqual([
      ["c3", "ignorato", "nessuna parola", null],
      ["c2", "errore", "finestra dei 7 giorni chiusa o messaggi non consentiti", "casa"],
      ["c1", "inviato", null, "casa"],
    ]);
    expect(d.eventi[0]).toMatchObject({ autoreNome: "utente_c3", testo: "Voglio la guida casa" });
    expect(d.richieste).toEqual([{ id: "r1", nome: "Mario", azienda: "Rossi Srl", telefono: "3331234567", slug: "guida", risorsa: "La guida", creataIl: NOW }]);
    expect(d.risorse).toEqual([{ slug: "guida", titolo: "La guida", attiva: true }]);
  });
  it("senza account: null", async () => {
    const d = await (await call("/api/risponditore", {}, cookie)).json<any>();
    expect(d).toMatchObject({ account: null, campagne: [], eventi: [], richieste: [] });
  });
});

describe("risponditore: account", () => {
  it("token buono: chiama /me, salva cifrato con scadenza a 60 giorni, risponde senza token", async () => {
    let chiamato = "";
    setMetaFetch(async (url) => {
      chiamato = String(url);
      return Response.json({ user_id: "17841", username: "acceleriamo" });
    });
    const prima = Date.now();
    const res = await call("/api/risponditore/account", { method: "POST", json: { token: "IGAAtoken" } }, cookie);
    expect(res.status).toBe(200);
    expect(chiamato).toContain("/me?fields=user_id,username");
    const corpo = await res.text();
    expect(corpo).not.toContain("IGAAtoken");
    const { account } = JSON.parse(corpo);
    expect(account.username).toBe("acceleriamo");
    expect(account.scadeIl).toBeGreaterThanOrEqual(prima + 60 * 86_400_000);
    const t = await leggiToken(env);
    expect(t).toMatchObject({ igUserId: "17841", username: "acceleriamo", token: "IGAAtoken" });
  });
  it("token rifiutato da Instagram: 400, nulla salvato", async () => {
    setMetaFetch(async () => Response.json({ error: { code: 190, message: "Invalid OAuth access token" } }, { status: 400 }));
    const res = await call("/api/risponditore/account", { method: "POST", json: { token: "sbagliato" } }, cookie);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toMatch(/Instagram/);
    expect(await env.DB.prepare("SELECT count(*) n FROM ig_account").first("n")).toBe(0);
  });
  it("spazio demo: 409, nessuna chiamata a Instagram", async () => {
    let chiamate = 0;
    setMetaFetch(async () => { chiamate++; return Response.json({ user_id: "1", username: "x" }); });
    const ctx = createExecutionContext();
    const req = new Request("https://test.local/api/risponditore/account", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ token: "t" }) });
    const res = await app.fetch(req, { ...env, SPAZIO: "demo" }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(409);
    expect(chiamate).toBe(0);
  });
  it("token vuoto: 400", async () => {
    expect((await call("/api/risponditore/account", { method: "POST", json: { token: " " } }, cookie)).status).toBe(400);
  });
});

describe("risponditore: risorse", () => {
  const risorsa = { titolo: "Nuova", sottotitolo: "Sotto", corpo: "Testo", pdfUrl: "https://esempio.it/a.pdf", attiva: true };
  it("crea e modifica", async () => {
    expect((await call("/api/risponditore/risorse/nuova-guida", { method: "PUT", json: risorsa }, cookie)).status).toBe(200);
    expect((await call("/api/risponditore/risorse/nuova-guida", { method: "PUT", json: { ...risorsa, titolo: "Cambiata", pdfUrl: null } }, cookie)).status).toBe(200);
    const r = await env.DB.prepare("SELECT titolo, pdf_url FROM risorse WHERE slug = 'nuova-guida'").first();
    expect(r).toEqual({ titolo: "Cambiata", pdf_url: null });
  });
  it("link del PDF solo http o https, slug in kebab-case", async () => {
    for (const pdfUrl of ["javascript:alert(1)", "data:text/html,x", "ftp://x.it/a.pdf"]) {
      expect((await call("/api/risponditore/risorse/nuova", { method: "PUT", json: { ...risorsa, pdfUrl } }, cookie)).status).toBe(400);
    }
    for (const slug of ["Nuova", "nuova_guida", "-nuova", "nuova--guida"]) {
      expect((await call(`/api/risponditore/risorse/${slug}`, { method: "PUT", json: risorsa }, cookie)).status).toBe(400);
    }
    expect(await env.DB.prepare("SELECT count(*) n FROM risorse").first("n")).toBe(1);
  });
});
