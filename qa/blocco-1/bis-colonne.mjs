// Blocco 1 bis, punto 4: foto della tabella con tutte le 13 colonne scelte (1440x900) e misura della larghezza.
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
await page.goto(base + "/");
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("lead-colonne:")) localStorage.removeItem(k); });
await page.goto(base + "/commerciale/lead");
await page.waitForSelector("section[aria-label='Tabella dei lead'] tr[data-lead]", { timeout: 20000 }).catch(async () => { await page.screenshot({ path: "/tmp/silvio-errore.png" }); console.log(await page.locator("main").innerText()); process.exit(1); });
const misura = () => page.evaluate(() => {
  const s = document.querySelector("section[aria-label='Tabella dei lead']"), t = s.querySelector("table");
  return { sezione: Math.round(s.getBoundingClientRect().width), tabella: Math.round(t.getBoundingClientRect().width), intestazioni: [...t.querySelectorAll("th")].map((th) => th.textContent).filter(Boolean) };
});
console.log("base", JSON.stringify(await misura()));
console.log("larghezze utili", JSON.stringify(await page.evaluate(() => { const r = document.querySelector("tr[data-lead]"); const th = [...document.querySelectorAll("thead th")]; return [...r.children].map((td, i) => { const el = td.firstElementChild; return [th[i]?.textContent, Math.round(td.getBoundingClientRect().width), el ? el.scrollWidth : 0, th[i]?.firstElementChild?.scrollWidth ?? 0]; }); })));
await page.getByRole("button", { name: /Colonne/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "qa/blocco-1/bis-colonne-menu-1440.png" });
for (const t of ["Email", "Inserzione", "Settore", "Attività", "Offerta", "Fonte"]) await page.getByRole("menuitemcheckbox", { name: t }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log("tutte", JSON.stringify(await misura()));
await page.reload(); await page.waitForSelector("tr[data-lead]");
console.log("dopo ricarica", JSON.stringify((await misura()).intestazioni.length));
// Si scorre di lato fino in fondo: si vedono le colonne nuove (Inserzione, Settore, Attività, Offerta, Fonte).
await page.evaluate(() => { const d = document.querySelector("section[aria-label='Tabella dei lead'] > div"); d.scrollLeft = d.scrollWidth; });
await page.waitForTimeout(200);
await page.screenshot({ path: "qa/blocco-1/bis-lead-colonne-1440.png" });
await browser.close();
