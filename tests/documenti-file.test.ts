import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getDb } from "../worker/db/client";
import { calls } from "../worker/db/schema";
import { eliminaPerSempre } from "../worker/leads/cestino";
import { authed, call, createUser, loginCookie } from "./helpers";

// Spec documenti 29/10/2026: file su R2, versioni, pallino delle novità, rotte dello script con CARICA_TOKEN.
// R2 non si svuota tra una prova e l'altra dello stesso file: si guarda solo la cartella del lead della prova.

const testo = (t: string) => new TextEncoder().encode(t);

async function nuovoLead(cookie: string, company = "Rossi Srl") {
  const res = await call("/api/leads", { method: "POST", json: { company, phone: `+39 333 ${Math.floor(1_000_000 + Math.random() * 8_999_999)}` } }, cookie);
  return ((await res.json()) as { lead: { id: string } }).lead.id;
}

async function carica(path: string, contenuto: string, cookie?: string, extra: Record<string, string> = {}) {
  const corpo = testo(contenuto);
  return call(path, { method: "POST", body: corpo, headers: { "content-type": "application/octet-stream", "content-length": String(corpo.byteLength), ...extra } }, cookie);
}

type Doc = { id: string; name: string; file: boolean; version: number; authorName: string | null; mime: string | null; kind: string; callId: string | null };
const dettaglio = async (id: string, cookie: string) => (await (await call(`/api/leads/${id}`, {}, cookie)).json()) as { documents: Doc[]; activities: { body: string }[] };
const novitaInLista = async (cookie: string, id: string) =>
  ((await (await call("/api/leads", {}, cookie)).json()) as { leads: { id: string; novita: number }[] }).leads.find((l) => l.id === id)?.novita;

async function dueUtenti() {
  const tommaso = await authed();
  await createUser("diego", "password-lunga-2", "Diego");
  const diego = await loginCookie("diego", "password-lunga-2");
  return { tommaso, diego };
}

describe("documenti caricati", () => {
  it("carica un PDF, lo mostra nella scheda e lo apre solo con la sessione", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    const res = await carica(`/api/leads/${id}/documents?nome=${encodeURIComponent("Preventivo è.pdf")}`, "%PDF-1.4 prova", cookie);
    expect(res.status).toBe(201);
    const { documents, activities } = await dettaglio(id, cookie);
    expect(documents[0]).toMatchObject({ name: "Preventivo è.pdf", file: true, version: 1, mime: "application/pdf", authorName: "Tommaso" });
    expect(activities[0].body).toBe('Caricato il documento "Preventivo è.pdf"');

    const file = await call(`/api/documents/${documents[0].id}/file`, {}, cookie);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("%PDF-1.4 prova");
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toMatch(/^inline; filename="Preventivo _.pdf"; filename\*=UTF-8''Preventivo%20%C3%A8\.pdf$/);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("cache-control")).toBe("private, no-store");
    const scarica = await call(`/api/documents/${documents[0].id}/file?scarica=1`, {}, cookie);
    expect(scarica.headers.get("content-disposition")).toMatch(/^attachment;/);
    await scarica.arrayBuffer();

    expect((await call(`/api/documents/${documents[0].id}/file`)).status).toBe(401);
  });

  it("nomi: via i caratteri che invertono il testo, apostrofi codificati in filename*", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    await carica(`/api/leads/${id}/documents?nome=${encodeURIComponent("l'offerta\u202Efdp.pdf")}`, "x", cookie);
    const [doc] = (await dettaglio(id, cookie)).documents;
    expect(doc.name).toBe("l'offertafdp.pdf");
    const file = await call(`/api/documents/${doc.id}/file`, {}, cookie);
    expect(file.headers.get("content-disposition")).toContain("filename*=UTF-8''l%27offertafdp.pdf");
    await file.arrayBuffer();
    // Lead nel cestino: file e storico non si aprono.
    await call(`/api/leads/${id}`, { method: "DELETE" }, cookie);
    expect((await call(`/api/documents/${doc.id}/file`, {}, cookie)).status).toBe(404);
    expect((await call(`/api/documents/${doc.id}/versioni`, {}, cookie)).status).toBe(404);
  });

  it("Excel e Word si scaricano, non si aprono nel browser", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    await carica(`/api/leads/${id}/documents?nome=conti.xlsx`, "PK...", cookie);
    const [doc] = (await dettaglio(id, cookie)).documents;
    const file = await call(`/api/documents/${doc.id}/file`, {}, cookie);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(file.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await file.arrayBuffer();
  });

  it("rifiuta tipi non ammessi, file vuoti e file sopra i 100 MB", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    for (const nome of ["pagina.html", "logo.svg", "virus.exe", "senza-estensione", "doppio.pdf.html"]) {
      const r = await carica(`/api/leads/${id}/documents?nome=${nome}`, "<script>alert(1)</script>", cookie);
      expect(r.status, nome).toBe(415);
    }
    expect((await carica(`/api/leads/${id}/documents?nome=a.pdf`, "", cookie)).status).toBe(411);
    const grosso = await call(`/api/leads/${id}/documents?nome=a.pdf`, { method: "POST", body: testo("x"), headers: { "content-type": "application/octet-stream", "content-length": String(100 * 1024 * 1024 + 1) } }, cookie);
    expect(grosso.status).toBe(413);
    expect((await dettaglio(id, cookie)).documents).toHaveLength(0);
    const { objects } = await env.DOCUMENTI!.list({ prefix: `lead/${id}/` });
    expect(objects).toHaveLength(0);
  });

  it("serve application/octet-stream, e il tipo servito lo decide l'estensione", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    expect((await carica(`/api/leads/${id}/documents?nome=nota.txt`, "<html>ciao</html>", cookie, { "content-type": "text/html" })).status).toBe(415);
    expect((await carica(`/api/leads/${id}/documents?nome=nota.txt`, "x", cookie, { "content-type": "multipart/form-data" })).status).toBe(415);
    await carica(`/api/leads/${id}/documents?nome=nota.txt`, "<html>ciao</html>", cookie);
    const [doc] = (await dettaglio(id, cookie)).documents;
    const file = await call(`/api/documents/${doc.id}/file`, {}, cookie);
    // Le trascrizioni si leggono nel browser (30/10/2026): sempre testo semplice, nosniff, mai HTML interpretato.
    expect(file.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("content-disposition")).toMatch(/^inline;/);
    await file.arrayBuffer();
  });

  it("nuova versione: la scheda mostra l'ultima, le precedenti restano nello storico", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    await carica(`/api/leads/${id}/documents?nome=offerta.pdf`, "versione uno", cookie);
    const [doc] = (await dettaglio(id, cookie)).documents;
    const r = await carica(`/api/documents/${doc.id}/versioni?nome=offerta-corretta.pdf`, "versione due", cookie);
    expect(r.status).toBe(201);
    const { documents, activities } = await dettaglio(id, cookie);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ name: "offerta.pdf", version: 2 });
    expect(activities[0].body).toBe('Nuova versione (2) del documento "offerta.pdf"');
    expect(await (await call(`/api/documents/${doc.id}/file`, {}, cookie)).text()).toBe("versione due");
    expect(await (await call(`/api/documents/${doc.id}/file?versione=1`, {}, cookie)).text()).toBe("versione uno");
    const { versioni } = (await (await call(`/api/documents/${doc.id}/versioni`, {}, cookie)).json()) as { versioni: { version: number; fileName: string }[] };
    expect(versioni.map((v) => [v.version, v.fileName])).toEqual([[2, "offerta-corretta.pdf"], [1, "offerta.pdf"]]);

    // Un link non ha versioni; togliere il documento lo toglie con tutte le versioni.
    await call(`/api/leads/${id}/documents`, { method: "POST", json: { name: "Drive", url: "https://drive.google.com/x" } }, cookie);
    const link = (await dettaglio(id, cookie)).documents.find((d) => !d.file)!;
    expect((await carica(`/api/documents/${link.id}/versioni?nome=a.pdf`, "x", cookie)).status).toBe(409);
    await call(`/api/documents/${doc.id}`, { method: "DELETE" }, cookie);
    expect((await call(`/api/documents/${doc.id}/file?versione=1`, {}, cookie)).status).toBe(404);
  });

  it("pallino: conta le novità di un altro, non le proprie, si azzera all'apertura della scheda", async () => {
    const { tommaso, diego } = await dueUtenti();
    const id = await nuovoLead(tommaso);
    await carica(`/api/leads/${id}/documents?nome=a.pdf`, "a", diego);
    await call(`/api/leads/${id}/documents`, { method: "POST", json: { name: "Drive", url: "https://drive.google.com/x" } }, diego);
    expect(await novitaInLista(tommaso, id)).toBe(2);
    expect(await novitaInLista(diego, id)).toBe(0);

    const [file] = (await dettaglio(id, tommaso)).documents.filter((d) => d.file);
    const visto = (await (await call(`/api/leads/${id}/visto`, { method: "POST" }, tommaso)).json()) as { novita: number; nuovi: string[] };
    expect(visto.novita).toBe(2);
    expect(visto.nuovi).toContain(file.id);
    expect(await novitaInLista(tommaso, id)).toBe(0);

    // Nuova versione di Diego: torna a 1. Tommaso carica una sua versione: a Diego 1, a Tommaso resta 1.
    await new Promise((r) => setTimeout(r, 5));
    await carica(`/api/documents/${file.id}/versioni?nome=a.pdf`, "a2", diego);
    expect(await novitaInLista(tommaso, id)).toBe(1);
    await carica(`/api/documents/${file.id}/versioni?nome=a.pdf`, "a3", tommaso);
    expect(await novitaInLista(diego, id)).toBe(1);
    // Le cancellazioni non contano, e un documento tolto non conta più.
    await call(`/api/documents/${file.id}`, { method: "DELETE" }, diego);
    expect(await novitaInLista(tommaso, id)).toBe(0);
  });

  it("elimina per sempre toglie anche versioni e file su R2", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    await carica(`/api/leads/${id}/documents?nome=a.pdf`, "a", cookie);
    const [doc] = (await dettaglio(id, cookie)).documents;
    await carica(`/api/documents/${doc.id}/versioni?nome=a.pdf`, "b", cookie);
    expect((await env.DOCUMENTI!.list({ prefix: `lead/${id}/` })).objects).toHaveLength(2);
    await call(`/api/leads/${id}`, { method: "DELETE" }, cookie);
    await eliminaPerSempre(getDb(env.DB), id, "tommaso", Date.now(), env.DOCUMENTI);
    expect((await env.DOCUMENTI!.list({ prefix: `lead/${id}/` })).objects).toHaveLength(0);
    const n = await env.DB.prepare("SELECT count(*) n FROM document_versions").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("rotte dello script (CARICA_TOKEN)", () => {
  const conToken = (t = "token-carica-test") => ({ authorization: `Bearer ${t}` });

  it("senza token o con token sbagliato risponde 401, e il token non apre le altre rotte", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    expect((await call("/api/carica/lead?q=Rossi")).status).toBe(401);
    expect((await call("/api/carica/lead?q=Rossi", { headers: conToken("sbagliato") })).status).toBe(401);
    expect((await call("/api/carica/lead?q=Rossi", { headers: { authorization: "token-carica-test" } })).status).toBe(401);
    expect((await carica(`/api/carica/lead/${id}/documenti?nome=a.pdf`, "a", undefined, conToken("sbagliato"))).status).toBe(401);
    expect((await call(`/api/leads/${id}`, { headers: conToken() })).status).toBe(401);
    expect((await call("/api/leads", { headers: conToken() })).status).toBe(401);
  });

  it("cerca il lead per nome e carica a nome di Tommaso, senza diciture in più", async () => {
    // In produzione l'utente di Tommaso è "tommaso.rovini" (UTENTE_SCRIPT).
    await createUser("tommaso.rovini", "password-lunga-3", "Tommaso");
    const tommaso = await loginCookie("tommaso.rovini", "password-lunga-3");
    await createUser("diego", "password-lunga-2", "Diego");
    const diego = await loginCookie("diego", "password-lunga-2");
    const id = await nuovoLead(tommaso, "Pizzeria Da Mario");
    await nuovoLead(tommaso, "Altra Ditta");
    const cerca = (await (await call("/api/carica/lead?q=mario", { headers: conToken() })).json()) as { leads: { id: string; company: string }[] };
    expect(cerca.leads.map((l) => l.company)).toEqual(["Pizzeria Da Mario"]);
    expect((await call("/api/carica/lead?q=m", { headers: conToken() })).status).toBe(400);
    // % e _ sono lettere, non jolly.
    const jolly = (await (await call("/api/carica/lead?q=%25%25", { headers: conToken() })).json()) as { leads: unknown[] };
    expect(jolly.leads).toHaveLength(0);

    const r = await carica(`/api/carica/lead/${id}/documenti?nome=chiamata.m4a`, "audio", undefined, conToken());
    expect(r.status).toBe(201);
    const { documents, activities } = await dettaglio(id, tommaso);
    expect(documents[0]).toMatchObject({ name: "chiamata.m4a", authorName: "Tommaso", mime: "audio/mp4", kind: "registrazione" });
    expect(documents[0]).not.toHaveProperty("via");
    expect(activities[0].body).toBe('Caricato il documento "chiamata.m4a"');
    expect(JSON.stringify(await dettaglio(id, diego))).not.toMatch(/claude/i);
    expect(await novitaInLista(diego, id)).toBe(1);
    expect(await novitaInLista(tommaso, id)).toBe(0);

    // --versione: stesso nome, nuova versione; nome che non c'è: 404.
    const v = await carica(`/api/carica/lead/${id}/documenti?nome=chiamata.m4a&versione=1`, "audio 2", undefined, conToken());
    expect(v.status).toBe(201);
    expect((await dettaglio(id, tommaso)).documents[0].version).toBe(2);
    expect((await carica(`/api/carica/lead/${id}/documenti?nome=altro.pdf&versione=1`, "x", undefined, conToken())).status).toBe(404);
    expect((await carica(`/api/carica/lead/inesistente/documenti?nome=a.pdf`, "x", undefined, conToken())).status).toBe(404);
  });

  it("tipo e call: regole automatiche, scelta esplicita, nuova versione che tiene il posto", async () => {
    await createUser("tommaso.rovini", "password-lunga-3", "Tommaso");
    const tommaso = await loginCookie("tommaso.rovini", "password-lunga-3");
    const id = await nuovoLead(tommaso, "Officina Prova");
    const db = getDb(env.DB);
    const giorno = (g: number, h: number) => Date.UTC(2026, 9, g, h);
    const ora = Date.now();
    await db.insert(calls).values([
      { id: `${id}-c1`, leadId: id, kind: "conoscenza", scheduledAt: giorno(20, 9), outcome: "fatta", createdAt: ora, updatedAt: ora },
      { id: `${id}-c2`, leadId: id, kind: "offerta", scheduledAt: giorno(27, 14), outcome: "fatta", createdAt: ora, updatedAt: ora },
      { id: `${id}-c3`, leadId: id, kind: "analisi", scheduledAt: giorno(28, 14), outcome: "saltata", createdAt: ora, updatedAt: ora },
    ]);
    const su = (q: string, corpo = "x") => carica(`/api/carica/lead/${id}/documenti?${q}`, corpo, undefined, conToken());

    // Audio con la data nel titolo: la call di quel giorno (anche se la call è alle 14 e il titolo dice solo il giorno).
    expect((await su(`nome=a.m4a&titolo=${encodeURIComponent("Registrazione consulenza 27/10")}`)).status).toBe(201);
    // Trascrizione con la data del file: l'ultima call fatta prima (la saltata non conta).
    expect((await su(`nome=${encodeURIComponent("Trascrizione consulenza.txt")}&data=${giorno(29, 10)}`)).status).toBe(201);
    // PDF "preventivo": preventivo, senza call.
    const prev = await su("nome=Preventivo-officina.pdf");
    expect(((await prev.json()) as { document: { kind: string; call: unknown } }).document).toMatchObject({ kind: "preventivo", call: null });
    // Tipo e call detti da chi carica: vince quello, la call si indica anche per tipo.
    expect((await su("nome=note.pdf&tipo=trascrizione&call=conoscenza")).status).toBe(201);
    // Foglio qualsiasi: altro.
    expect((await su("nome=conti.xlsx")).status).toBe(201);
    // Errori: tipo sconosciuto, call di un altro lead.
    expect((await su("nome=a.pdf&tipo=boh")).status).toBe(400);
    expect((await su("nome=a.pdf&call=non-esiste")).status).toBe(404);

    const { documents } = await dettaglio(id, tommaso);
    const per = (n: string) => documents.find((d) => d.name === n)!;
    expect(per("Registrazione consulenza 27/10")).toMatchObject({ kind: "registrazione", callId: `${id}-c2` });
    expect(per("Trascrizione consulenza.txt")).toMatchObject({ kind: "trascrizione", callId: `${id}-c2` });
    expect(per("Preventivo-officina.pdf")).toMatchObject({ kind: "preventivo", callId: null });
    expect(per("note.pdf")).toMatchObject({ kind: "trascrizione", callId: `${id}-c1` });
    expect(per("conti.xlsx")).toMatchObject({ kind: "altro", callId: null });

    // Dalla scheda: stesse regole; una nuova versione tiene tipo e call.
    const r = await carica(`/api/leads/${id}/documents?nome=${encodeURIComponent("preventivo v1.pdf")}`, "p1", tommaso);
    const docId = ((await r.json()) as { document: { id: string; kind: string } }).document.id;
    await carica(`/api/documents/${docId}/versioni?nome=altro-nome.pdf`, "p2", tommaso);
    expect((await dettaglio(id, tommaso)).documents.find((d) => d.id === docId)).toMatchObject({ kind: "preventivo", version: 2 });

    // Trascrizione aperta nel browser, non scaricata.
    const t = await call(`/api/documents/${per("Trascrizione consulenza.txt").id}/file`, {}, tommaso);
    expect(t.headers.get("content-disposition")).toMatch(/^inline;/);
    await t.arrayBuffer();
  });

  it("documento di una cosa da fare: legato alla task, la nuova versione la tiene, task di un altro lead rifiutata", async () => {
    const cookie = await authed();
    const id = await nuovoLead(cookie);
    const altro = await nuovoLead(cookie, "Bianchi Srl");
    const t = (await (await call("/api/tasks", { method: "POST", json: { title: "Mandare il listino", leadId: id } }, cookie)).json()) as { id: string };
    const r = await carica(`/api/leads/${id}/documents?nome=listino.pdf&task=${t.id}`, "l1", cookie);
    expect(r.status).toBe(201);
    const doc = ((await dettaglio(id, cookie)).documents as (Doc & { taskId: string | null })[]).find((d) => d.name === "listino.pdf");
    expect(doc?.taskId).toBe(t.id);
    await carica(`/api/documents/${doc?.id}/versioni?nome=listino-2.pdf`, "l2", cookie);
    const dopo = ((await dettaglio(id, cookie)).documents as (Doc & { taskId: string | null })[]).find((d) => d.id === doc?.id);
    expect(dopo?.version).toBe(2);
    expect(dopo?.taskId).toBe(t.id);
    expect((await carica(`/api/leads/${altro}/documents?nome=a.pdf&task=${t.id}`, "x", cookie)).status).toBe(404);
    // Task eliminata: il documento resta nella scheda.
    await call(`/api/tasks/${t.id}`, { method: "DELETE" }, cookie);
    expect((await dettaglio(id, cookie)).documents.some((d) => d.id === doc?.id)).toBe(true);
  });
});
