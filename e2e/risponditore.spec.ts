import { expect, test } from "@playwright/test";
import { DATA, controlla, entra, fermo } from "./controlli";

// Cartella facoltativa dove copiare le foto della schermata (per il registro del piano), fuori dal repo.
const CARTELLA = process.env.RISPONDITORE_FOTO ?? "";

test("risponditore: account, campagne, richieste e registro", async ({ page }, info) => {
  await entra(page);
  await page.goto("/automazioni/risponditore");
  await fermo(page);
  await expect(page.getByRole("heading", { level: 1, name: "Risponditore" })).toBeVisible();
  await expect(page.getByText("Collegato come @acceleriamo.it")).toBeVisible();
  await expect(page.getByText("Rinnovo tra 45 giorni")).toBeVisible();
  const campagne = page.getByRole("region", { name: "Campagne" });
  await expect(campagne.getByText("Schema del workflow")).toBeVisible();
  await expect(campagne.getByText("Tutti i post")).toBeVisible();
  await expect(campagne.getByText("Spenta")).toBeVisible();
  await expect(page.getByRole("region", { name: "Richieste di chiamata" }).getByText("Mario Rossi")).toBeVisible();
  const registro = page.getByRole("region", { name: "Registro degli invii" });
  for (const s of ["Link mandato", "Inviato", "Ignorato", "Errore"]) await expect(registro.getByText(s, { exact: true })).toBeVisible();
  await expect(registro.getByText("finestra dei 7 giorni chiusa o messaggi non consentiti")).toBeVisible();
  expect(await controlla(page, info.project.name as "tel" | "desk")).toEqual([]);
  if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/task-8-${info.project.name}.png`, fullPage: true });
  await expect(page).toHaveScreenshot("risponditore.png", { fullPage: true, mask: [page.getByText(DATA)] });
});

test("risponditore: il foglio della campagna ha un solo pulsante pieno", async ({ page }, info) => {
  await entra(page);
  await page.goto("/automazioni/risponditore");
  await page.getByRole("region", { name: "Campagne" }).getByRole("button", { name: /Schema del workflow/ }).click();
  const foglio = page.getByRole("dialog", { name: "Modifica la campagna" });
  await expect(foglio).toBeVisible();
  await expect(foglio.getByLabel("Parola nel commento")).toHaveValue("workflow");
  await expect(foglio.getByRole("button", { name: /Su quali post/ })).toBeVisible();
  await fermo(page);
  expect(await controlla(page, info.project.name as "tel" | "desk")).toEqual([]);
});
