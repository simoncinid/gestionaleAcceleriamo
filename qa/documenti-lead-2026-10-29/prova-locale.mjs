// Prova vera contro il server locale (spazio demo): caricamento, nuova versione, pallino visto da un secondo utente.
// Uso: BASE=http://localhost:5232 node qa/documenti-lead-2026-10-29/prova-locale.mjs
const BASE = process.env.BASE ?? "http://localhost:5232";
const PASSWORD = "password-demo-locale-e2e";

async function entra(username) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`);
  return r.headers.get("set-cookie").split(";")[0];
}
const get = async (path, cookie) => (await fetch(`${BASE}/api${path}`, { headers: { cookie } })).json();
async function carica(path, cookie, testo) {
  const r = await fetch(`${BASE}/api${path}`, { method: "POST", headers: { cookie, "content-type": "application/octet-stream" }, body: new TextEncoder().encode(testo) });
  return { status: r.status, corpo: await r.json() };
}
const novita = async (cookie, id) => (await get("/leads", cookie)).leads.find((l) => l.id === id)?.novita;

const tommaso = await entra("tommaso");
const diego = await entra("demo");
const { leads } = await get("/leads", tommaso);
const lead = leads[0];
console.log("lead di prova:", lead.company, lead.id);
console.log("pallino iniziale di Tommaso:", await novita(tommaso, lead.id));

const a = await carica(`/leads/${lead.id}/documents?nome=preventivo-prova.pdf`, diego, "%PDF-1.4 versione uno");
console.log("Diego carica un PDF:", a.status, a.corpo.document);
console.log("pallino di Tommaso:", await novita(tommaso, lead.id), "| pallino di Diego:", await novita(diego, lead.id));

const v = await carica(`/documents/${a.corpo.document.id}/versioni?nome=preventivo-prova-v2.pdf`, diego, "%PDF-1.4 versione due");
console.log("Diego carica la versione 2:", v.status, v.corpo.document);
console.log("pallino di Tommaso:", await novita(tommaso, lead.id));

const visto = await (await fetch(`${BASE}/api/leads/${lead.id}/visto`, { method: "POST", headers: { cookie: tommaso } })).json();
console.log("Tommaso apre la scheda, novità che vede:", visto);
console.log("pallino di Tommaso dopo l'apertura:", await novita(tommaso, lead.id));

const f = await fetch(`${BASE}/api/documents/${a.corpo.document.id}/file`, { headers: { cookie: tommaso } });
console.log("apertura ultima versione:", f.status, f.headers.get("content-type"), f.headers.get("content-disposition"), JSON.stringify(await f.text()));
const f1 = await fetch(`${BASE}/api/documents/${a.corpo.document.id}/file?versione=1`, { headers: { cookie: tommaso } });
console.log("apertura versione 1:", f1.status, JSON.stringify(await f1.text()));
const anon = await fetch(`${BASE}/api/documents/${a.corpo.document.id}/file`);
console.log("senza sessione:", anon.status);
console.log("LEAD_ID=" + lead.id + " LEAD_NOME=" + JSON.stringify(lead.company));
