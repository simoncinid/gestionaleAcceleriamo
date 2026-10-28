// Modifica 8: nuovo lead a mano con il telefono di Studio Partitadoppia (aperto). Non nasce: compare "Esiste già: apri ...".
export default async (page) => {
  await page.getByText("Officina Bullonetti").first().waitFor({ state: "attached", timeout: 20_000 });
  await page.keyboard.press("n");
  await page.getByLabel("Azienda").fill("Partitadoppia di nuovo");
  await page.getByLabel("Telefono").fill("+39 000 100 0020");
  await page.getByRole("button", { name: "Salva e apri la scheda" }).click();
  const avviso = page.getByRole("alert").filter({ hasText: "Esiste già" });
  await avviso.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  return `avviso: ${(await avviso.innerText()).trim()}`;
};
