// Modifica 9: cestino con giorni rimasti, Ripristina ed Elimina; apre la conferma in riga sul primo lead (non elimina).
export default async (page) => {
  await page.getByRole("button", { name: "Ripristina" }).first().waitFor({ timeout: 20_000 });
  const righe = await page.getByRole("button", { name: "Ripristina" }).count();
  const giorni = await page.getByText(/si elimina da solo/).first().innerText();
  await page.getByRole("button", { name: "Elimina", exact: true }).first().click();
  await page.getByRole("button", { name: "Elimina per sempre" }).waitFor();
  await page.waitForTimeout(300);
  return `lead nel cestino ${righe}, "${giorni}", conferma in riga aperta`;
};
