import { defineConfig } from "@playwright/test";

// Spec 19.2: controlli visivi e automatici sullo spazio demo locale (D1 locale, nessuna rete esterna).
const PORTA = 5199;
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/prepara.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  snapshotPathTemplate: "e2e/__screenshots__/{testFileName}/{projectName}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
  use: { baseURL: `http://localhost:${PORTA}`, locale: "it-IT", timezoneId: "Europe/Rome", trace: "retain-on-failure" },
  projects: [
    { name: "tel", use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "desk", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `CLOUDFLARE_ENV=demo npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
