#!/usr/bin/env node
// Carica un file nella scheda di un lead di Acceleriamo OS (spec documenti 29/10/2026, punto 6).
// Le voci risultano di Tommaso, come se le avesse caricate lui, e accendono il pallino a Diego.
//
// Uso:
//   node scripts/carica-documento.mjs --lead "Pizzeria Da Mario" percorso/file.m4a
//   node scripts/carica-documento.mjs --lead-id <id> preventivo.pdf --versione       (nuova versione del documento con lo stesso nome)
//   opzioni: --titolo "Nome mostrato"   --base http://localhost:5173   (default https://risorse.acceleriamo.it)
//            --tipo registrazione|trascrizione|preventivo|altro   (senza: audio = registrazione, "trascrizione" = trascrizione,
//                                                                  PDF "preventivo" = preventivo, il resto altro)
//            --call <id o tipo: conoscenza, offerta, analisi, progetto>   (senza: per registrazioni e trascrizioni
//                                                                  l'ultima call prima della data del file)
//            --data AAAA-MM-GG   (senza: la data "GG/MM" nel titolo o nel nome, altrimenti la data di modifica del file)
// Token: portachiavi del Mac (servizio acceleriamo-carica-token); per le prove in locale ACCELERIAMO_CARICA_TOKEN.
// Esce con 0 se caricato, 2 se il lead non si trova o non è unico, 1 per gli altri errori.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const LIMITE = 100 * 1024 * 1024;
const TIPI = ["registrazione", "trascrizione", "preventivo", "altro"];
const TIPO_TESTO = { registrazione: "registrazione", trascrizione: "trascrizione", preventivo: "preventivo", altro: "altro documento" };

function argomenti(argv) {
  const a = { file: null, lead: null, leadId: null, titolo: null, tipo: null, call: null, data: null, versione: false, base: process.env.ACCELERIAMO_OS_URL || "https://risorse.acceleriamo.it" };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--lead") a.lead = argv[++i];
    else if (x === "--lead-id") a.leadId = argv[++i];
    else if (x === "--titolo") a.titolo = argv[++i];
    else if (x === "--base") a.base = argv[++i];
    else if (x === "--tipo") a.tipo = argv[++i];
    else if (x === "--call") a.call = argv[++i];
    else if (x === "--data") a.data = argv[++i];
    else if (x === "--versione") a.versione = true;
    else if (x.startsWith("--")) esci(1, `Opzione sconosciuta: ${x}`);
    else a.file = x;
  }
  if (!a.file || (!a.lead && !a.leadId)) esci(1, 'Uso: carica-documento.mjs --lead "<nome>" | --lead-id <id> <file> [--titolo "..."] [--versione] [--base <indirizzo>]');
  if (a.tipo && !TIPI.includes(a.tipo)) esci(1, `Tipo non valido: ${a.tipo}. Vanno bene: ${TIPI.join(", ")}`);
  if (a.data && !/^\d{4}-\d{2}-\d{2}$/.test(a.data)) esci(1, "Data non valida: scrivila AAAA-MM-GG");
  a.base = a.base.replace(/\/+$/, "");
  // Il token non viaggia mai in chiaro: http solo verso questo Mac.
  let u;
  try { u = new URL(a.base); } catch { esci(1, `Indirizzo non valido: ${a.base}`); }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) esci(1, "Serve un indirizzo https (http solo per localhost)");
  return a;
}

function esci(codice, messaggio) {
  (codice === 0 ? console.log : console.error)(messaggio);
  process.exit(codice);
}

function token() {
  if (process.env.ACCELERIAMO_CARICA_TOKEN) return process.env.ACCELERIAMO_CARICA_TOKEN;
  try {
    return execFileSync("security", ["find-generic-password", "-s", "acceleriamo-carica-token", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    esci(1, "Token non trovato nel portachiavi (servizio acceleriamo-carica-token)");
  }
}

async function risposta(res) {
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) esci(res.status === 404 ? 2 : 1, `Errore ${res.status}: ${corpo.error ?? "risposta non valida"}`);
  return corpo;
}

const a = argomenti(process.argv.slice(2));
const auth = { authorization: `Bearer ${token()}` };
let dim, modificato;
try { const st = statSync(a.file); dim = st.size; modificato = st.mtimeMs; } catch { esci(1, `File non trovato: ${a.file}`); }
if (dim === 0) esci(1, "Il file è vuoto");
if (dim > LIMITE) esci(1, "Il file supera i 100 MB");

let lead = a.leadId ? { id: a.leadId, company: a.leadId } : null;
if (!lead) {
  const { leads } = await risposta(await fetch(`${a.base}/api/carica/lead?q=${encodeURIComponent(a.lead)}`, { headers: auth }));
  const esatti = leads.filter((l) => l.company.trim().toLowerCase() === a.lead.trim().toLowerCase());
  const scelti = esatti.length === 1 ? esatti : leads;
  if (scelti.length === 0) esci(2, `Nessun lead trovato per "${a.lead}"`);
  if (scelti.length > 1) esci(2, `Più lead per "${a.lead}", usa --lead-id:\n${scelti.map((l) => `  ${l.id}  ${l.company}${l.contactName ? ` (${l.contactName})` : ""}, ${l.fase ?? ""}`).join("\n")}`);
  lead = scelti[0];
}

const q = new URLSearchParams({ nome: basename(a.file) });
if (a.titolo) q.set("titolo", a.titolo);
if (a.versione) q.set("versione", "1");
if (a.tipo) q.set("tipo", a.tipo);
if (a.call) q.set("call", a.call);
// Con --data vale quella (fine giornata di Roma la decide il server dal titolo); senza, il server guarda prima "GG/MM" nel nome.
q.set("data", String(a.data ? Date.parse(`${a.data}T20:00:00Z`) : Math.round(modificato)));
const res = await fetch(`${a.base}/api/carica/lead/${encodeURIComponent(lead.id)}/documenti?${q}`, {
  method: "POST",
  headers: { ...auth, "content-type": "application/octet-stream" },
  body: readFileSync(a.file),
});
const { document } = await risposta(res);
const dove = document.call
  ? `, accanto alla call di ${document.call.kind} del ${new Date(document.call.scheduledAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`
  : document.kind === "registrazione" || document.kind === "trascrizione" ? ", nessuna call trovata: resta in Documenti" : "";
esci(0, `Caricato "${document.name}" su ${lead.company} (versione ${document.version}, ${TIPO_TESTO[document.kind] ?? document.kind}${dove})`);
