// Uso: npx tsx scripts/create-user.ts <username> "<Nome visibile>"
// Chiede la password, scrive l'SQL in un file locale (ignorato da git) e stampa il comando wrangler.
// La password non viene salvata da nessuna parte, solo il suo hash dentro il file .local.sql.
import { createInterface } from "node:readline/promises";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../worker/auth/password";
import { buildUserSql } from "../worker/auth/user-sql";

const [username, name] = process.argv.slice(2);
if (!username || !name) {
  console.error('Uso: npx tsx scripts/create-user.ts <username> "<Nome visibile>"');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Password (almeno 12 caratteri): ");
rl.close();
if (password.length < 12) {
  console.error("Password troppo corta");
  process.exit(1);
}
const id = username.trim().toLowerCase();
const file = `create-user-${id.replace(/[^a-z0-9_-]/g, "_")}.local.sql`;
writeFileSync(file, buildUserSql(id, name, await hashPassword(password)), { mode: 0o600 });
console.log(`\nSQL scritto in ${file}. Esegui:\n\nnpx wrangler d1 execute acceleriamo-os --local --file ${file}\n\nPer il database online usa --remote al posto di --local. Poi cancella il file.\n`);
