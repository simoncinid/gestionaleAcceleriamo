// Foto del blocco 1 sull'anteprima locale (porta 5210), utente demo.
// Uso: node qa/blocco-1/foto.mjs <percorso> <nome> [passi.mjs]
// Fa una foto a 1440x900 e una a 390x844 in qa/blocco-1/<nome>-1440.png e -390.png.
// passi.mjs (facoltativo) esporta default async (page, larghezza) => testo da stampare: clic e controlli prima della foto.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";

const [percorso, nome, passiFile] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:5210";
const passi = passiFile ? (await import(pathToFileURL(passiFile).href)).default : null;
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${BASE}/`);
  await page.getByLabel("Utente").fill(process.env.UTENTE ?? "demo");
  await page.getByLabel("Password").fill(process.env.DEMO_PASSWORD ?? "anteprima-locale-26");
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\//);
  await page.goto(`${BASE}${percorso}`);
  await page.waitForLoadState("networkidle");
  if (passi) console.log(`${w}:`, await passi(page, w));
  const largo = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (largo) console.log(`${w}: ATTENZIONE scorrimento laterale`);
  await page.screenshot({ path: `qa/blocco-1/${nome}-${w}.png`, fullPage: true });
  await page.close();
}
await browser.close();
