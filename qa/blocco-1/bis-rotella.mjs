// Blocco 1 bis: prova della rotella del mouse sulla tabella dei lead (1440x900).
import { chromium } from "playwright";
const porta = process.argv[2] ?? "5288";
const base = `http://localhost:${porta}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + "/");
await page.getByLabel("Utente").fill("demo");
await page.getByLabel("Password").fill("password-demo-locale-e2e");
await page.getByRole("button", { name: "Entra" }).click();
await page.waitForURL(/\/commerciale\/oggi/);
await page.goto(base + "/commerciale/lead");
await page.waitForLoadState("networkidle");
await page.mouse.move(800, 500);
for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(30); }
await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const righe = [...document.querySelectorAll("tr[data-lead]")];
  const u = righe.at(-1).getBoundingClientRect();
  const scorrevoli = [...document.querySelectorAll("*")].filter((e) => e.scrollTop > 0).map((e) => e.tagName + "." + e.className.toString().slice(0, 40) + ":" + e.scrollTop);
  return { righe: righe.length, ultimaSopra: Math.round(u.top), ultimaSotto: Math.round(u.bottom), finestra: innerHeight, scrollY, scorrevoli };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: `qa/blocco-1/${process.argv[3] ?? "prima"}-rotella-1440.png` });
await browser.close();
