// Uso: npx tsx scripts/migrate-from-old.ts old-dashboard.json migration-old.sql
import { readFileSync, writeFileSync } from "node:fs";
import { buildMigrationSql, type OldDashboard } from "./lib/migrate";

const [input = "old-dashboard.json", output = "migration-old.sql"] = process.argv.slice(2);
const OLD_BASE_URL = "https://acceleriamo-os.diegosimoncini.chatgpt.site";
const old = JSON.parse(readFileSync(input, "utf8")) as OldDashboard;
if (!Array.isArray(old.leads)) throw new Error("Il file non contiene 'leads': è l'export di /api/dashboard?");
const { statements, counts, toDownload } = buildMigrationSql(old, { now: Date.now(), oldBaseUrl: OLD_BASE_URL, userIds: ["tommaso", "diego"] });
writeFileSync(output, `${statements.join("\n")}\n`);
console.log(`Scritto ${output}: ${counts.leads} lead, ${counts.activities} voci di storico, ${counts.documents} documenti.`);
console.log(`Lead nel vecchio: ${old.leads.length}. Attività del vecchio considerate: ${(old.activities ?? []).length} (il vecchio ne espone al massimo 500).`);
if (toDownload.length) {
  console.log("\nFile caricati nel vecchio gestionale, da scaricare e mettere su Drive prima di spegnerlo:");
  for (const d of toDownload) console.log(`- ${d.company}: ${d.name} -> ${d.url}`);
}
