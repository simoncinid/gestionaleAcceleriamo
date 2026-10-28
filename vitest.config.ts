import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Plugin Cloudflare per vitest 4: il database è isolato per file di prova.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["./tests/apply-migrations.ts"],
  },
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.resolve("drizzle"));
      return {
        main: "./worker/index.ts",
        miniflare: {
          compatibilityDate: "2026-09-15",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB", "DB_PRE"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            META_APP_SECRET: "segreto-test",
            META_VERIFY_TOKEN: "verifica-test",
            META_PAGE_TOKEN: "token-test",
            META_GRAPH_VERSION: "v23.0",
            IG_APP_SECRET: "segreto-ig-test",
            IG_VERIFY_TOKEN: "verifica-ig-test",
            IG_TOKEN_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            IG_GRAPH_VERSION: "v25.0",
            RESEND_API_KEY: "re_test",
            PROPOSAL_HOOK_KEY: "chiave-aggancio-test",
            MAIL_HOOK_KEY: "chiave-posta-test",
            GOOGLE_SA_EMAIL: "",
            GOOGLE_SA_PRIVATE_KEY: "",
            ANTHROPIC_API_KEY: "sk-ant-test",
            TELEGRAM_BOT_TOKEN: "123:test",
            TELEGRAM_BOT: "acceleriamo_test_bot",
            VAPID_SOGGETTO: "https://os.esempio.it",
            APP_URL: "https://os.esempio.it",
          },
        },
      };
    }),
  ],
});
