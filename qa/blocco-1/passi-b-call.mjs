// Passi della corsia B: dalla scheda del lead apre la pagina della call dal link in linea del Da fare.
export default async function (page) {
  await page.waitForSelector('[data-sezione="da-fare"]', { timeout: 20000 });
  await page.locator('[data-sezione="da-fare"] a[href^="/commerciale/call/"]').first().click();
  await page.waitForSelector('[data-sezione="call"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => JSON.stringify({
    titolo: document.querySelector("main h1")?.textContent, contatto: document.querySelector("[data-riga-contatto]")?.textContent,
    primari: document.querySelectorAll('main [data-variante="primario"]').length, testoPrimario: document.querySelector('main [data-variante="primario"]')?.textContent,
  }));
}
