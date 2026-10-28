// Modifica 19: a 1440 apre il filtro Fase, a 390 apre il foglio "Filtri".
export default async (page, w) => {
  await page.locator("h1").first().waitFor();
  if (w >= 768) {
    await page.locator("[data-filtro=Fase]").click();
  } else {
    await page.getByRole("button", { name: /^Filtri/ }).click();
    await page.getByRole("dialog").waitFor();
  }
  await page.waitForTimeout(300);
  return await page.locator("h1").first().innerText();
};
