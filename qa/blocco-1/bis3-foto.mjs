// Blocco 1 bis: foto del filtro "Arrivati" della tabella Lead, tendina aperta su "Periodo..." (1440) e foglio Filtri (390).
// Uso: node qa/blocco-1/bis3-foto.mjs [porta] [password]
import { chromium } from "playwright";

const porta = process.argv[2] ?? "5210";
const password = process.argv[3] ?? "password-demo-locale-e2e";
const base = `http://localhost:${porta}`;
const browser = await chromium.launch();
for (const [nome, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "it-IT", timezoneId: "Europe/Rome", deviceScaleFactor: nome === "390" ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(base + "/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
  await page.goto(base + "/commerciale/lead");
  await page.waitForLoadState("networkidle");
  const titolo = async () => (await page.locator("h1").first().textContent())?.trim();
  console.log(nome, "Sempre:", await titolo());
  if (nome === "1440") {
    const filtro = page.locator('[data-filtro="Arrivati"]');
    await filtro.click();
    await page.getByRole("menuitemradio", { name: "Ultimi 7 giorni" }).click();
    await page.waitForTimeout(300);
    console.log(nome, "7 giorni:", await titolo(), "|", await filtro.textContent(), "|", page.url().split("?")[1]);
    await filtro.click();
    await page.getByRole("menuitemradio", { name: "Oggi", exact: true }).click();
    await page.waitForTimeout(300);
    console.log(nome, "Oggi:", await titolo(), "|", await filtro.textContent());
    await filtro.click();
    await page.getByRole("menuitemradio", { name: "Periodo..." }).click();
    const oggi = new Date().toISOString().slice(0, 10);
    const prima = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Dal", { exact: true }).fill(prima);
    await page.getByLabel("Al", { exact: true }).fill(oggi);
    await page.waitForTimeout(300);
    console.log(nome, "Periodo:", await titolo(), "|", await filtro.textContent(), "|", page.url().split("?")[1]);
    await page.screenshot({ path: `qa/blocco-1/bis3-lead-filtro-arrivati-${nome}.png` });
  } else {
    await page.getByRole("button", { name: /^Filtri/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Arrivati/ }).click();
    await page.waitForTimeout(200);
    await page.getByRole("option", { name: "Periodo" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `qa/blocco-1/bis3-lead-filtro-arrivati-${nome}.png` });
  }
  await ctx.close();
}
await browser.close();
