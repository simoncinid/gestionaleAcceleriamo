import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";
import { setEmailFetch } from "../worker/email/fetcher";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Nessun test parla con Resend davvero: chi vuole un invio mette il suo fetcher finto dentro il test.
beforeEach(() => setEmailFetch(async () => { throw new Error("rete vietata nei test"); }));
