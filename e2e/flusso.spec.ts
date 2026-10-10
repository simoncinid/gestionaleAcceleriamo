import { expect, test, type Locator } from "@playwright/test";
import { entra, fermo } from "./controlli";

// Spec 19.2: dal blocco Adesso a "Salva esito" in 4 tocchi al massimo.
test("da Adesso a Salva esito in 4 tocchi", async ({ page }) => {
  await entra(page);
  await fermo(page);
  let tocchi = 0;
  const tocca = async (l: Locator) => { await l.click(); tocchi++; };
  await tocca(page.getByRole("region", { name: "Adesso" }).getByRole("button", { name: "Esito" }));
  const foglio = page.getByRole("dialog");
  await expect(foglio).toBeVisible();
  // Il selettore dell'esito è già aperto (QA Piano A): si sceglie la prima voce, la prossima azione è proposta.
  await tocca(foglio.getByRole("option").first());
  await tocca(foglio.getByRole("button", { name: /^Salva esito/ }));
  await expect(foglio).toBeHidden();
  expect(tocchi).toBeLessThanOrEqual(4);
});

// QA del Task 15, controlli 19 e 30: chiuso con Annulla, il foglio riporta il fuoco al pulsante che l'ha aperto.
test("Annulla riporta il fuoco a chi ha aperto il foglio", async ({ page }) => {
  await entra(page);
  await page.goto("/commerciale/scaletta");
  await fermo(page);
  const filtri = page.getByRole("button", { name: /^Filtri/ });
  await filtri.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(filtri).toBeFocused();
});

// QA del Task 15, controllo 30: Fissa call aperto da "Altre azioni" sta in un foglio che si chiude; alla chiusura il
// fuoco torna al pulsante "Altre azioni" della scheda e non finisce su body.
test("Fissa call aperto da Altre azioni riporta il fuoco ad Altre azioni", async ({ page }) => {
  await entra(page);
  await page.goto("/commerciale/lead/demo-lead-17");
  await fermo(page);
  const altre = page.getByRole("button", { name: "Altre azioni" });
  await altre.click();
  await page.getByRole("dialog").getByRole("button", { name: /^Fissa call/ }).click();
  await expect(page.getByRole("dialog", { name: "Fissa call" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(altre).toBeFocused();
});
