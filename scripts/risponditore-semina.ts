// Uso: npx tsx scripts/risponditore-semina.ts <file.json> [--remote]
// Legge un JSON con "risorse" e "campagne" del risponditore (vedi risponditore-semina.esempio.json), lo controlla,
// scrive l'SQL in un file .local.sql (ignorato da git), lo esegue sul D1 acceleriamo-os e lo cancella.
// Si può rilanciare: le risorse si riconoscono dallo slug, le campagne dalla parola (normalizzata) e dal post,
// quello che esiste viene aggiornato e non duplicato. Senza --remote tocca solo il database locale.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { sqlSemina, validaSemina } from "./lib/risponditore-semina";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const dove = process.argv.includes("--remote") ? "--remote" : "--local";
if (!file) {
  console.error("Uso: npx tsx scripts/risponditore-semina.ts <file.json> [--remote]");
  process.exit(1);
}
let semina;
try {
  semina = validaSemina(JSON.parse(readFileSync(file, "utf8")));
} catch (e) {
  console.error(`File non valido:\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
for (const a of semina.avvisi) console.warn(`Attenzione, ${a}`);
const sql = "semina-risponditore.local.sql";
writeFileSync(sql, `${sqlSemina(semina, Date.now()).join("\n")}\n`, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os", dove, "--file", sql, "--yes"], { stdio: "inherit" });
  console.log(`\nRisponditore seminato (${dove === "--remote" ? "online" : "in locale"}): ${semina.risorse.length} risorse, ${semina.campagne.length} campagne.\n`);
} finally {
  rmSync(sql, { force: true });
}
