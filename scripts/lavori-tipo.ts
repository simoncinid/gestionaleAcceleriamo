// Uso: npx tsx scripts/lavori-tipo.ts [--remote]
// Crea o aggiorna i tre lavori tipo ("Una tantum", "Mensile", "Mensile più una tantum") con i loro passi
// (scripts/lib/lavori-tipo.ts). Scrive l'SQL in un file .local.sql (ignorato da git), lo esegue sul D1
// acceleriamo-os e lo cancella. Si può rilanciare: gli id sono fissi. Senza --remote tocca solo il database locale.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { LAVORI_TIPO, sqlLavoriTipo } from "./lib/lavori-tipo";

const dove = process.argv.includes("--remote") ? "--remote" : "--local";
const sql = "lavori-tipo.local.sql";
writeFileSync(sql, `${sqlLavoriTipo(Date.now()).join("\n")}\n`, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os", dove, "--file", sql, "--yes"], { stdio: "inherit" });
  console.log(`\nLavori tipo pronti (${dove === "--remote" ? "online" : "in locale"}): ${LAVORI_TIPO.map((l) => `${l.nome}, ${l.passi.length} passi`).join("; ")}.\n`);
} finally {
  rmSync(sql, { force: true });
}
