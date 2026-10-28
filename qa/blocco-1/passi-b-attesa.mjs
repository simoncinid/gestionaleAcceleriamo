// Aspetta che la pagina abbia finito di caricare (niente scheletri) prima della foto.
export default async function (page) {
  await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  return { passaggio: await page.locator("[data-passaggio]").allInnerTexts(), rigaContatto: await page.locator("[data-riga-contatto]").allInnerTexts() };
}
