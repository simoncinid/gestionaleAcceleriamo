// Aspetta che la pagina abbia il titolo (fine del caricamento) e dice cosa si vede.
export default async (page) => {
  await page.waitForSelector("h1", { timeout: 15000 });
  await page.waitForTimeout(300);
  return await page.locator("h1").first().innerText();
};
