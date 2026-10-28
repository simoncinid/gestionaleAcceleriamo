import type { Env as EnvWorker } from "../worker/env";

// Il plugin Cloudflare per vitest 4 tipizza `env` di "cloudflare:test" come Cloudflare.Env.
declare global {
  namespace Cloudflare {
    interface Env extends EnvWorker {
      DB_PRE: D1Database; // database vuoto della prova sulle migrazioni (vitest.config.ts)
      TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
    }
  }
}
