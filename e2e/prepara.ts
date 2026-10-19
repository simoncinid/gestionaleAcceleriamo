// Prima di ogni giro: migrazioni e dati finti nel D1 locale della demo, con l'ora fissa delle foto.
import { execFileSync } from "node:child_process";
import { ORA_DEMO, PASSWORD_DEMO } from "./controlli";

export default function prepara() {
  const opz = { stdio: "inherit" as const, env: { ...process.env, DEMO_ORA: String(ORA_DEMO), DEMO_PASSWORD: PASSWORD_DEMO } };
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "acceleriamo-os-demo", "--env", "demo", "--local"], opz);
  execFileSync("npx", ["tsx", "scripts/seed-demo.ts", "--local"], opz);
  // Risorsa di prova per la pagina pubblica /r/prova (il seed della demo non ne ha).
  const risorsa = "INSERT OR REPLACE INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES ('prova', 'lo schema del workflow', 'Come rispondere ai commenti senza perdere un contatto', 'Un commento arriva, il messaggio parte da solo.\n\n- Commenti letti\n- Risposta pubblica\n- Messaggio privato con la guida', 'https://example.com/scheda.pdf', 1, 1)";
  execFileSync("npx", ["wrangler", "d1", "execute", "acceleriamo-os-demo", "--env", "demo", "--local", "--command", risorsa], opz);
}
