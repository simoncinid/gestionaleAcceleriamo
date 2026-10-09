import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { setEmailFetch } from "../worker/email/fetcher";
import { setGoogleFetch } from "../worker/foglio/fetcher";
import { setPushFetch } from "../worker/push/fetcher";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Nessun test parla con Resend, con Google o con i servizi push davvero: chi vuole un invio mette il suo fetcher finto dentro il test.
beforeEach(() => {
  setEmailFetch(async () => { throw new Error("rete vietata nei test"); });
  setGoogleFetch(async () => { throw new Error("rete vietata nei test"); });
  setPushFetch(async () => { throw new Error("rete vietata nei test"); });
});
