// Passi della corsia B: apre il foglio dell'esito dal primario del Da fare e misura il foglio.
export default async function (page) {
  await page.waitForSelector('[data-sezione="da-fare"]', { timeout: 20000 });
  await page.locator('[data-sezione="da-fare"] button', { hasText: /^Segna/ }).first().click();
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    const r = d.getBoundingClientRect();
    return JSON.stringify({ larghezza: Math.round(r.width), sinistra: Math.round(r.left), titolo: d.querySelector("h2")?.textContent, voci: [...d.querySelectorAll('[role="option"], [role="radio"], li button')].map((b) => b.textContent.trim()).slice(0, 8) });
  });
}
