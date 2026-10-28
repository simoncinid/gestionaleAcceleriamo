// Blocco 1 bis: foto della pagina Lead (e delle altre) a 1440x900 e 390x844, con la misura dello scorrimento.
// Uso: node qa/blocco-1/bis-foto.mjs [porta] [prefisso]
import { chromium } from "playwright";

const porta = process.argv[2] ?? "5288";
const prefisso = process.argv[3] ?? "bis";
const ORA = Date.UTC(2026, 9, 12, 8, 0);
const base = `http://localhost:${porta}`;
const pagine = ["/commerciale/lead", "/commerciale/oggi", "/commerciale/proposte", "/commerciale/clienti"];

const browser = await chromium.launch();
for (const [nome, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "it-IT", timezoneId: "Europe/Rome", deviceScaleFactor: nome === "390" ? 2 : 1 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(ORA);
  await page.goto(base + "/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill("password-demo-locale-e2e");
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
  for (const p of pagine) {
    await page.goto(base + p);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    // In fondo alla pagina e in fondo al contenitore della tabella: l'ultima riga deve essere tutta visibile.
    const esito = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      for (const el of document.querySelectorAll("*")) if (el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== "visible") el.scrollTop = el.scrollHeight;
      const righe = [...document.querySelectorAll("[data-lead]")].filter((r) => r.getBoundingClientRect().height > 0);
      const ultima = righe.at(-1)?.getBoundingClientRect();
      return { righe: righe.length, fondo: ultima ? Math.round(ultima.bottom) : null, finestra: innerHeight, pagina: document.documentElement.scrollHeight };
    });
    await page.waitForTimeout(200);
    console.log(nome, p, JSON.stringify(esito));
    if (p === "/commerciale/lead") {
      await page.evaluate(() => { window.scrollTo(0, 0); for (const el of document.querySelectorAll("*")) el.scrollTop = 0; });
      await page.screenshot({ path: `qa/blocco-1/${prefisso}-lead-${nome}.png` });
    }
  }
  // Scheda del primo lead.
  await page.goto(base + "/commerciale/lead");
  await page.waitForLoadState("networkidle");
  const id = await page.locator("[data-lead]").first().getAttribute("data-lead");
  await page.goto(base + "/commerciale/lead/" + id);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const scheda = await page.evaluate(() => { window.scrollTo(0, 1e6); return { y: Math.round(scrollY), pagina: document.documentElement.scrollHeight, finestra: innerHeight }; });
  console.log(nome, "scheda", JSON.stringify(scheda));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `qa/blocco-1/${prefisso}-scheda-${nome}.png` });
  await page.goto(base + "/commerciale/oggi");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `qa/blocco-1/${prefisso}-oggi-${nome}.png` });
  await ctx.close();
}
await browser.close();
