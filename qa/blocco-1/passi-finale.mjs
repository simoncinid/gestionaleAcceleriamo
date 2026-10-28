// Aspetta che spariscano i segnaposto di caricamento prima della foto.
export default async (page) => {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return (await page.locator("h1").first().textContent().catch(() => "")) ?? "";
};
