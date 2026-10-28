// Modifica 20: a 1440 sceglie "Consulenza fissata" dalla cella Fase della prima riga (si apre il foglio della call);
// PASSO=tendina si ferma alla tendina aperta, PASSO=menu apre il menu "..." della riga.
export default async (page, w) => {
  await page.locator("h1").first().waitFor();
  if (w < 768) return "390: niente cella fase";
  const riga = page.locator("tbody tr").first();
  if (process.env.PASSO === "menu") {
    await riga.getByRole("button", { name: /Altre azioni/ }).click();
  } else {
    await riga.getByRole("button", { name: /^Fase di/ }).click();
    if (process.env.PASSO !== "tendina") {
      await page.getByRole("menuitemradio", { name: "Consulenza fissata" }).click();
      await page.getByRole("dialog").last().waitFor();
    }
  }
  await page.waitForTimeout(400);
  return await page.locator("[role=dialog]").last().innerText().then((t) => t.split("\n").slice(0, 3).join(" | ")).catch(() => "nessun foglio");
};
