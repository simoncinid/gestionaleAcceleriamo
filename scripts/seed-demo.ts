// Uso: npm run demo:reset (database online della demo) oppure npm run demo:locale (database locale della demo).
// Chiede la password dell'utente demo (o la legge da DEMO_PASSWORD), scrive l'SQL in un file .local.sql
// (ignorato da git, leggibile solo dal proprietario), lo esegue sul D1 della demo e lo cancella.
// Rimette anche fasi, regole, modelli e impostazioni come dopo le migrazioni.
// Tocca solo il database acceleriamo-os-demo (ambiente "demo" di wrangler.jsonc), mai quello di produzione.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../worker/auth/password";
import { datiDemo, istruzioniBase, sqlDemo } from "./demo-dati";

const dove = process.argv.includes("--remote") ? "--remote" : "--local";
let password = process.env.DEMO_PASSWORD;
if (password === undefined) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("Password dell'utente demo (almeno 12 caratteri): ");
  rl.close();
}
if (password.length < 12) {
  console.error("Password troppo corta");
  process.exit(1);
}
const file = "demo-seed.local.sql";
// DEMO_ORA (millisecondi) fissa il "adesso" dei dati: lo usa Playwright per foto sempre uguali (Task 15).
const ora = Number(process.env.DEMO_ORA ?? Date.now());
// Fasi, regole, modelli e impostazioni tornano come dopo le migrazioni (cartella drizzle, in ordine di nome).
const migrazioni = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()
  .flatMap((f) => readFileSync(`drizzle/${f}`, "utf8").split("--> statement-breakpoint"));
writeFileSync(file, `${sqlDemo(datiDemo(ora, await hashPassword(password)), istruzioniBase(migrazioni)).join("\n")}\n`, { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os-demo", "--env", "demo", dove, "--file", file, "--yes"], { stdio: "inherit" });
  console.log(`\nSpazio demo ripristinato (${dove === "--remote" ? "online" : "in locale"}). Utente: demo.\n`);
} finally {
  rmSync(file, { force: true });
}
