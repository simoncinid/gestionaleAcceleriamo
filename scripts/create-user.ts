// Uso: npx tsx scripts/create-user.ts <username> "<Nome visibile>"
// Chiede la password e stampa il comando wrangler da eseguire. La password non viene salvata da nessuna parte.
import { createInterface } from "node:readline/promises";
import { hashPassword } from "../worker/auth/password";

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
const hash = await hashPassword(password);
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql = `INSERT INTO users (id, username, name, password_hash, active, failed_logins, created_at) VALUES (${q(id)}, ${q(id)}, ${q(name)}, ${q(hash)}, 1, 0, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name, active = 1, failed_logins = 0, locked_until = NULL;`;
console.log(`\nEsegui (aggiungi --remote per il database online):\n\nnpx wrangler d1 execute acceleriamo-os --local --command "${sql.replace(/"/g, '\\"')}"\n`);
