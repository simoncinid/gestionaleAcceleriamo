import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.resolve("drizzle"));
  return {
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          main: "./worker/index.ts",
          miniflare: {
            compatibilityDate: "2026-09-15",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DB"],
            bindings: {
              TEST_MIGRATIONS: migrations,
              META_APP_SECRET: "segreto-test",
              META_VERIFY_TOKEN: "verifica-test",
              META_PAGE_TOKEN: "token-test",
              META_GRAPH_VERSION: "v23.0",
            },
          },
        },
      },
    },
  };
});
