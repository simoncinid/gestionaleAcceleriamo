import { expect, test } from "@playwright/test";

const CARTELLA = process.env.RISORSA_FOTO ?? "";

test("pagina risorsa pubblica: senza accesso si legge e si richiede la chiamata", async ({ page }, info) => {
  await page.goto("/r/prova");
  await expect(page.getByRole("heading", { level: 1, name: "lo schema del workflow" })).toBeVisible();
  await expect(page).toHaveURL(/\/r\/prova$/);
  await expect(page.getByRole("link", { name: "Scarica la scheda" })).toBeVisible();
  await expect(page.getByLabel("Telefono")).toBeVisible();
  // Nessun guscio dell'app e nessun modulo di accesso.
  await expect(page.getByLabel("Password")).toHaveCount(0);

  if (CARTELLA && info.project.name === "tel") await page.screenshot({ path: `${CARTELLA}/task-7-pagina-mobile.png`, fullPage: true });

  await page.getByLabel("Nome").fill("Mario Rossi");
  await page.getByLabel("Azienda").fill("Rossi Srl");
  await page.getByLabel("Telefono").fill("333 123 4567");
  await page.getByRole("button", { name: "Richiedi la chiamata" }).click();
  await expect(page.getByText("Grazie, ti chiamiamo entro un giorno lavorativo.")).toBeVisible();
  await expect(page.getByLabel("Telefono")).toHaveCount(0);

  if (CARTELLA && info.project.name === "tel") await page.screenshot({ path: `${CARTELLA}/task-7-grazie-mobile.png`, fullPage: true });
});

test("pagina risorsa pubblica: telefono troppo corto, errore scritto sotto il modulo", async ({ page }) => {
  await page.goto("/r/prova");
  await page.getByLabel("Nome").fill("Mario");
  await page.getByLabel("Azienda").fill("Rossi Srl");
  await page.getByLabel("Telefono").fill("12345");
  await page.getByRole("button", { name: "Richiedi la chiamata" }).click();
  await expect(page.getByRole("alert")).toContainText("telefono");
  await expect(page.getByRole("button", { name: "Richiedi la chiamata" })).toBeEnabled();
});

test("pagina risorsa pubblica: slug inesistente", async ({ page }) => {
  await page.goto("/r/non-esiste");
  await expect(page.getByRole("heading", { name: "Questa pagina non c'è più" })).toBeVisible();
});

test("pagina risorsa pubblica: niente scorrimento di lato a 360 e 390 pixel, lo schema ha i suoi numeri", async ({ page }, info) => {
  test.skip(info.project.name !== "tel", "controllo del telefono");
  for (const larghezza of [360, 390]) {
    await page.setViewportSize({ width: larghezza, height: 800 });
    await page.goto("/r/prova");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, `larghezza ${larghezza}`).toBeLessThanOrEqual(cw);
    // Il corpo è markdown letto: nessun simbolo "- " o "**" resta a vista.
    await expect(page.locator(".risorsa-corpo li")).toHaveCount(3);
    await expect(page.locator(".risorsa-corpo")).not.toContainText("**");
  }
});
