// Sistema i documenti già caricati (30/10/2026): dà a ognuno tipo e call con le stesse regole dei caricamenti nuovi
// (worker/leads/tipo-documento.ts) e toglie ogni traccia della vecchia dicitura dello script dalle attività.
// Cambia solo colonne e testi: nessun documento, versione o file viene tolto.
//
// Uso:
//   npx tsx scripts/organizza-documenti.ts --local              (prova: mostra cosa farebbe sul database locale)
//   npx tsx scripts/organizza-documenti.ts --remote             (prova sul database di produzione: solo lettura)
//   npx tsx scripts/organizza-documenti.ts --remote --applica   (scrive; prima la copia del database)
//   --demo: lo spazio demo (acceleriamo-os-demo) invece di produzione, per le prove
// Tocca solo documenti ancora "altro" e senza call: rilanciarlo non cambia quelli già sistemati.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callPerData, dataDalTitolo, tipoAutomatico, vaSullaCall, type CallPerScelta } from "../worker/leads/tipo-documento";

const args = process.argv.slice(2);
const dove = args.includes("--remote") ? "--remote" : args.includes("--local") ? "--local" : null;
const applica = args.includes("--applica");
const db = args.includes("--demo") ? ["acceleriamo-os-demo", "--env", "demo"] : ["acceleriamo-os"];
if (!dove) {
  console.error("Scegli --local o --remote (e --applica per scrivere)");
  process.exit(1);
}

function query<T>(sql: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", ...db, dove!, "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

type Doc = { id: string; leadId: string; company: string; name: string; fileName: string | null; createdAt: number };
const docs = query<Doc>(`SELECT d.id, d.lead_id AS leadId, l.company, d.name, v.file_name AS fileName, d.created_at AS createdAt
  FROM documents d JOIN leads l ON l.id = d.lead_id
  LEFT JOIN document_versions v ON v.document_id = d.id AND v.version = d.version
  WHERE d.deleted_at IS NULL AND d.kind = 'altro' AND d.call_id IS NULL AND d.r2_key IS NOT NULL ORDER BY l.company, d.name`);
const chiamate = query<CallPerScelta & { leadId: string }>(`SELECT id, lead_id AS leadId, kind, scheduled_at AS scheduledAt, outcome FROM calls WHERE deleted_at IS NULL`);

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const giorno = (t: number) => new Date(t).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
const sql: string[] = [];
for (const d of docs) {
  // Il nome mostrato fa da titolo (dice "Registrazione", "Preventivo", la data); il nome del file dà l'estensione.
  const kind = tipoAutomatico(d.fileName ?? d.name, d.name);
  let callId: string | null = null;
  let nota = "";
  if (vaSullaCall(kind)) {
    const elenco = chiamate.filter((k) => k.leadId === d.leadId);
    const data = dataDalTitolo(`${d.name} ${d.fileName ?? ""}`, d.createdAt);
    const k = data != null ? callPerData(elenco, data, true) : callPerData(elenco, d.createdAt);
    callId = k?.id ?? null;
    nota = k ? ` -> call di ${k.kind} del ${giorno(k.scheduledAt)}` : " -> nessuna call trovata: resta in Documenti";
  }
  console.log(`${d.company}: "${d.name}" = ${kind}${nota}`);
  if (kind !== "altro" || callId) sql.push(`UPDATE documents SET kind = ${q(kind)}, call_id = ${callId ? q(callId) : "NULL"} WHERE id = ${q(d.id)} AND kind = 'altro' AND call_id IS NULL;`);
}

// Le voci caricate dallo script risultano solo di Tommaso: via la dicitura dalle attività, "via" diventa "script".
const vecchie = query<{ n: number }>(`SELECT count(*) AS n FROM activities WHERE type = 'documento' AND body LIKE '% (caricato da Claude)%'`)[0].n;
console.log(`Attività con la vecchia dicitura da ripulire: ${vecchie}`);
sql.push(`UPDATE activities SET body = replace(body, ' (caricato da Claude)', '') WHERE type = 'documento' AND body LIKE '% (caricato da Claude)%';`);
sql.push(`UPDATE documents SET via = 'script' WHERE via = 'claude';`);
sql.push(`UPDATE document_versions SET via = 'script' WHERE via = 'claude';`);

if (!applica) {
  console.log(`\nProva: ${docs.length} documenti letti, ${sql.length - 3} da sistemare. Niente scritto: aggiungi --applica.`);
  process.exit(0);
}
const file = join(mkdtempSync(join(tmpdir(), "organizza-")), "organizza.sql");
writeFileSync(file, sql.join("\n"));
execFileSync("npx", ["wrangler", "d1", "execute", ...db, dove, "--file", file, "--yes"], { stdio: "inherit" });
console.log(`Scritto: ${sql.length - 3} documenti sistemati, attività ripulite.`);
