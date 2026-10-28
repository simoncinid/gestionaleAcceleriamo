// Blocco 1 bis: ordinamento per "Arrivato il" (e Azienda, Fase) nella tabella Lead, foto a 1440 ordinata dal più recente.
// Uso: node qa/blocco-1/bis4-foto.mjs [porta] [password]
import { chromium } from "playwright";

const porta = process.argv[2] ?? "5210";
const password = process.argv[3] ?? "password-demo-locale-e2e";
const base = `http://localhost:${porta}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT", timezoneId: "Europe/Rome" });
const page = await ctx.newPage();
await page.goto(base + "/");
await page.getByLabel("Utente").fill("demo");
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Entra" }).click();
await page.waitForURL(/\/commerciale\/oggi/);
await page.goto(base + "/commerciale/lead");
await page.waitForLoadState("networkidle");
const testa = (t) => page.locator("thead th", { hasText: t });
const stato = async (t) => {
  const th = testa(t);
  const btn = th.locator("button");
  return `${t}: aria-sort=${await th.getAttribute("aria-sort")} cursore=${await btn.evaluate((b) => getComputedStyle(b).cursor)} url=${page.url().split("?")[1] ?? ""}`;
};
const indice = await page.locator("thead th").evaluateAll((ths) => ths.findIndex((t) => t.textContent.includes("Arrivato il")));
const arrivi = async () => (await page.locator(`tbody tr td:nth-child(${indice + 1})`).allTextContents()).slice(0, 6).join(" | ");
const aziende = async () => (await page.locator("tbody tr td:nth-child(1)").allTextContents()).slice(0, 4).map((s) => s.slice(0, 30)).join(" | ");

await testa("Arrivato il").locator("button").click(); await page.waitForTimeout(200);
console.log("1 clic", await stato("Arrivato il"), "\n  ", await arrivi());
await testa("Arrivato il").locator("button").click(); await page.waitForTimeout(200);
console.log("2 clic", await stato("Arrivato il"), "\n  ", await arrivi());
await testa("Arrivato il").locator("button").click(); await page.waitForTimeout(200);
await page.reload(); await page.waitForLoadState("networkidle");
console.log("ricarica", await stato("Arrivato il"), "\n  ", await arrivi());
await page.getByRole("radio", { name: /Chiusi/ }).or(page.getByRole("tab", { name: /Chiusi/ })).or(page.getByRole("button", { name: /^Chiusi/ })).first().click();
await page.waitForTimeout(300);
console.log("filtro Chiusi", await stato("Arrivato il"), "\n  ", await arrivi());
await page.getByRole("radio", { name: /Aperti/ }).or(page.getByRole("tab", { name: /Aperti/ })).or(page.getByRole("button", { name: /^Aperti/ })).first().click();
await page.waitForTimeout(300);
await testa("Azienda").locator("button").click(); await page.waitForTimeout(200);
console.log("Azienda", await stato("Azienda"), "\n  ", await aziende());
await testa("Fase").locator("button").click(); await page.waitForTimeout(200);
console.log("Fase", await stato("Fase"));
await testa("Arrivato il").locator("button").click(); await page.waitForTimeout(300);
console.log("finale", await stato("Arrivato il"), "\n  ", await arrivi());
await testa("Arrivato il").locator("button").hover();
await page.screenshot({ path: "qa/blocco-1/bis4-lead-ordina-arrivo-1440.png" });
await browser.close();
