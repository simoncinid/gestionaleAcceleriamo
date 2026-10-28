import { expect, test, type Page } from "@playwright/test";
import { PASSWORD_DEMO } from "./controlli";
import prepara from "./prepara";

// Riunione del 26/10/2026: il percorso vero di un lead, dalla prima telefonata al contratto, con le fasi nuove.
// Orologio vero (niente setFixedTime): il server rifiuta le call nel passato.
async function entraOraVera(page: Page) {
  await page.goto("/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill(PASSWORD_DEMO);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
}

// Il percorso scrive nei dati della demo: alla fine si rimettono come all'inizio, così le foto degli altri test non cambiano.
test.afterAll(() => prepara());

const fase = (page: Page) => page.getByRole("button", { name: /^Fase/ }).first();

async function esito(page: Page, nome: string, dopo?: (foglio: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page.getByRole("button", { name: "Segna esito" }).click();
  const foglio = page.getByRole("dialog", { name: "Com'è andata?" });
  await foglio.getByRole("option", { name: nome, exact: true }).click();
  if (dopo) await dopo(foglio);
  await foglio.getByRole("button", { name: /^Salva esito/ }).click();
  await expect(foglio).toBeHidden();
}

async function callDomani(page: Page, foglio: ReturnType<Page["getByRole"]>, preset: string) {
  await foglio.getByRole("button", { name: /^Data della call/ }).click();
  await page.getByRole("option", { name: preset }).click();
  await foglio.getByLabel("Link Meet").fill("meet.google.com/abc-defg-hij");
}

test("dalla prima chiamata al contratto", async ({ page }) => {
  test.skip(test.info().project.name !== "desk", "un giro solo: il percorso modifica i dati della demo");
  await entraOraVera(page);
  await page.goto("/commerciale/lead/demo-lead-10");
  await expect(fase(page)).toContainText("Nuovo, da chiamare");

  // 1. Prima telefonata: consulenza fissata (il link senza https va bene).
  await esito(page, "Consulenza fissata", (f) => callDomani(page, f, "Domani 10:00"));
  await expect(fase(page)).toContainText("Consulenza fissata");

  // 2. Dopo la consulenza: prossima azione "Preparare il preventivo", non di nuovo la call di conoscenza.
  await page.getByRole("button", { name: "Segna esito" }).click();
  const f2 = page.getByRole("dialog", { name: "Com'è andata?" });
  await expect(f2.getByRole("option").first()).toHaveText(/Consulenza fatta/);
  await f2.getByRole("option", { name: "Consulenza fatta", exact: true }).click();
  await expect(f2.getByRole("button", { name: /^Prossima azione/ })).toContainText("Preparare il preventivo");
  await f2.getByRole("button", { name: /^Salva esito/ }).click();
  await expect(f2).toBeHidden();
  await expect(fase(page)).toContainText("In attesa preventivo");

  // 3. Preventivo pronto: si fissa la presentazione (seconda call).
  await esito(page, "Presentazione fissata", (f) => callDomani(page, f, "Tra 3 giorni"));
  await expect(fase(page)).toContainText("Presentazione fissata");

  // 4. Presentazione fatta: in attesa della decisione.
  await esito(page, "Presentazione fatta");
  await expect(fase(page)).toContainText("In attesa decisione");

  // 5. Contratto firmato: Cliente, scelto dal selettore della fase dentro la scheda.
  await fase(page).click();
  await page.getByRole("option", { name: "Cliente", exact: true }).click();
  const chiusura = page.getByRole("dialog", { name: /Cliente/ });
  await chiusura.getByLabel("Setup (euro)").fill("2000");
  await chiusura.getByLabel("Canone mensile (euro)").fill("300");
  await chiusura.getByRole("button", { name: /^Data di inizio/ }).click();
  await page.getByRole("option").first().click();
  await chiusura.getByRole("button", { name: /Salva la chiusura|Chiudi e crea il cliente/ }).click();
  await expect(chiusura).toBeHidden();
  await expect(fase(page)).toContainText("Cliente");
});

// Il bug del 26/10: dentro "Com'è andata?" la scelta della fase (selettore lungo, in un foglio figlio) chiudeva tutto.
test("scegliere la fase dentro il foglio dell'esito non chiude il foglio", async ({ page }) => {
  await entraOraVera(page);
  await page.goto("/commerciale/lead/demo-lead-30");
  await page.getByRole("button", { name: "Segna esito" }).click();
  const foglio = page.getByRole("dialog", { name: "Com'è andata?" });
  await foglio.getByRole("option", { name: "Richiamare", exact: true }).click();
  await foglio.getByRole("button", { name: /^Fase/ }).click();
  await page.getByRole("option", { name: "In attesa decisione" }).click();
  await expect(foglio).toBeVisible();
  await expect(foglio.getByRole("button", { name: /^Fase/ })).toContainText("In attesa decisione");
});

// Collaudo del 26/10, voce 1: Esc con il selettore della fase aperto chiudeva tutto il foglio e la nota scritta andava persa.
test("Esc nel selettore della fase chiude solo il selettore", async ({ page }) => {
  await entraOraVera(page);
  await page.goto("/commerciale/lead/demo-lead-20");
  await page.getByRole("button", { name: "Segna esito" }).click();
  const foglio = page.getByRole("dialog", { name: "Com'è andata?" });
  await foglio.getByRole("option", { name: "Richiamare", exact: true }).click();
  const fase = foglio.getByRole("button", { name: /^Fase/ });
  await fase.focus();
  await page.keyboard.press("Enter");
  await expect(fase).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(fase).toHaveAttribute("aria-expanded", "false");
  await expect(foglio).toBeVisible();
});
