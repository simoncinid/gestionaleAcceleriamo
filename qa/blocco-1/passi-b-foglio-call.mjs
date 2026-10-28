// Apre il primo foglio di una call dalla lista e legge la riga del contatto.
export default async function (page) {
  await page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout: 8000 }).catch(() => undefined);
  const blocco = page.locator("li button").filter({ hasText: "Call di" }).first();
  if (!(await blocco.waitFor({ timeout: 8000 }).then(() => true, () => false))) return { foglio: "nessuna call in lista" };
  await blocco.click();
  await page.locator("[data-riga-contatto]").first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  return { rigaContatto: await page.locator("[data-riga-contatto]").allInnerTexts() };
}
