import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { setClaudeFetch } from "../worker/claude/fetcher";
import { setEmailFetch } from "../worker/email/fetcher";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { setPushFetch } from "../worker/push/fetcher";
import { setTelegramFetch } from "../worker/telegram/fetcher";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Nessun test parla con Resend, con Google, con i servizi push, con Telegram o con Anthropic davvero: chi vuole un invio mette il suo fetcher finto dentro il test.
beforeEach(() => {
  setEmailFetch(async () => { throw new Error("rete vietata nei test"); });
  setGoogleFetch(async () => { throw new Error("rete vietata nei test"); });
  setPushFetch(async () => { throw new Error("rete vietata nei test"); });
  setTelegramFetch(async () => { throw new Error("rete vietata nei test"); });
  setClaudeFetch(async () => { throw new Error("rete vietata nei test"); });
});
