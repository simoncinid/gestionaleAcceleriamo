// Prima di ogni giro: migrazioni e dati finti nel D1 locale della demo, con l'ora fissa delle foto.
import { execFileSync } from "node:child_process";
import { ORA_DEMO, PASSWORD_DEMO } from "./controlli";

export default function prepara() {
  const opz = { stdio: "inherit" as const, env: { ...process.env, DEMO_ORA: String(ORA_DEMO), DEMO_PASSWORD: PASSWORD_DEMO } };
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "acceleriamo-os-demo", "--env", "demo", "--local"], opz);
  execFileSync("npx", ["tsx", "scripts/seed-demo.ts", "--local"], opz);
}
