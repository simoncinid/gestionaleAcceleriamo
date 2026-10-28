import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { setClaudeFetch } from "../worker/claude/fetcher";
import { setEmailFetch } from "../worker/email/fetcher";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { setPushFetch } from "../worker/push/fetcher";
import { setTelegramFetch } from "../worker/telegram/fetcher";

// Ogni prova parte da un database appena migrato, come faceva il vecchio pool (isolatedStorage):
// il plugin Cloudflare per vitest 4 isola i dati solo tra un file e l'altro, non tra le prove dello stesso file.
async function svuota(db: D1Database) {
  const { results } = await db
    .prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
    .all<{ type: string; name: string }>();
  if (!results.length) return;
  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = on"),
    ...results.filter((r) => r.type === "view").map((r) => db.prepare(`DROP VIEW "${r.name}"`)),
    ...results.filter((r) => r.type === "table").map((r) => db.prepare(`DROP TABLE "${r.name}"`)),
  ]);
}

beforeEach(async () => {
  await svuota(env.DB);
  await svuota(env.DB_PRE);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// Nessun test parla con Resend, con Google, con i servizi push, con Telegram o con Anthropic davvero: chi vuole un invio mette il suo fetcher finto dentro il test.
beforeEach(() => {
  setEmailFetch(async () => { throw new Error("rete vietata nei test"); });
  setGoogleFetch(async () => { throw new Error("rete vietata nei test"); });
  setPushFetch(async () => { throw new Error("rete vietata nei test"); });
  setTelegramFetch(async () => { throw new Error("rete vietata nei test"); });
  setClaudeFetch(async () => { throw new Error("rete vietata nei test"); });
});
