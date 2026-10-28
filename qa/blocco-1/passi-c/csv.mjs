// Modifica 21: apre il menu "..." della pagina; a 1440 scarica il CSV e ne controlla i byte (BOM, ";", accenti).
import { readFile } from "node:fs/promises";
export default async (page, w) => {
  await page.locator("h1").first().waitFor();
  await page.getByRole("button", { name: "Altre azioni dei lead" }).click();
  await page.waitForTimeout(300);
  if (w < 768) return await page.getByRole("menuitem").first().innerText();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Esporta CSV/ }).click()]);
  const file = await dl.path();
  const b = await readFile(file);
  const testo = b.toString("utf8");
  const righe = testo.split("\r\n").filter(Boolean);
  await page.getByRole("button", { name: "Altre azioni dei lead" }).click();
  await page.waitForTimeout(300);
  return `${dl.suggestedFilename()} BOM=${b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf} righe=${righe.length} colonne=${righe[0].split(";").length} prima=${righe[1].split(";").slice(0, 3).join(" | ")}`;
};
