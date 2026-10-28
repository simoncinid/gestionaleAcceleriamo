import { expect, test, type Page } from "@playwright/test";
import { DATA, controlla, entra, fermo } from "./controlli";

const ORA_VERA = /\b\d{1,2}:\d{2}\b/;

type Schermata = { nome: string; percorso: string; prima?: (p: Page) => Promise<void> };
const SCHERMATE: Schermata[] = [
  { nome: "oggi", percorso: "/commerciale/oggi" },
  { nome: "foglio-esito", percorso: "/commerciale/oggi", prima: async (p) => { await p.getByRole("region", { name: "Adesso" }).getByRole("button", { name: "Esito" }).click(); await expect(p.getByRole("dialog")).toBeVisible(); } },
  { nome: "lunedi", percorso: "/commerciale/oggi/lunedi" },
  { nome: "diario", percorso: "/commerciale/oggi/diario" },
  { nome: "scaletta", percorso: "/commerciale/scaletta" },
  { nome: "scheda-lead", percorso: "/commerciale/lead/demo-lead-30" },
  { nome: "call", percorso: "/commerciale/call" },
  { nome: "proposte", percorso: "/commerciale/proposte" },
  { nome: "clienti", percorso: "/commerciale/clienti" },
  { nome: "scheda-cliente", percorso: "/commerciale/clienti/demo-cliente-1" },
  { nome: "numeri-funnel", percorso: "/commerciale/numeri?vista=funnel" },
  { nome: "numeri-campagne", percorso: "/commerciale/numeri?vista=campagne" },
  { nome: "numeri-previsione", percorso: "/commerciale/numeri?vista=previsione" },
  { nome: "pannello", percorso: "/automazioni" },
  { nome: "pannello-anonimo", percorso: "/automazioni", prima: async (p) => { await p.getByRole("switch", { name: "Nomi dei clienti nascosti" }).click(); } },
  { nome: "lavori", percorso: "/automazioni/lavori" },
  { nome: "stato", percorso: "/automazioni/stato" },
  { nome: "scheda-automazione", percorso: "/automazioni/demo-auto-1" },
  { nome: "cruscotto", percorso: "/economia" },
  { nome: "canoni", percorso: "/economia/canoni" },
  { nome: "fatture", percorso: "/economia/fatture" },
  { nome: "costi", percorso: "/economia/costi" },
  { nome: "impostazioni-stato", percorso: "/impostazioni" },
  { nome: "impostazioni-fasi", percorso: "/impostazioni/fasi" },
  { nome: "impostazioni-integrazioni", percorso: "/impostazioni/integrazioni" },
  { nome: "impostazioni-utenti", percorso: "/impostazioni/utenti" },
  { nome: "impostazioni-dati", percorso: "/impostazioni/dati" },
  { nome: "impostazioni-lavori-tipo", percorso: "/impostazioni/lavori-tipo" },
];

// Errori in console e risposte 4xx/5xx: il 401 di /api/auth/me prima dell'accesso è atteso.
function ascolta(page: Page) {
  const errori: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) errori.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errori.push(`pagina: ${String(e).slice(0, 160)}`));
  page.on("response", (r) => { if (r.status() >= 400 && !(r.status() === 401 && r.url().endsWith("/api/auth/me"))) errori.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  return errori;
}

test("login", async ({ page }, info) => {
  const errori = ascolta(page);
  await page.goto("/");
  await fermo(page);
  expect(await controlla(page, info.project.name as "tel" | "desk")).toEqual([]);
  expect(errori).toEqual([]);
  await expect(page).toHaveScreenshot("login.png", { fullPage: true });
});

for (const s of SCHERMATE) {
  test(s.nome, async ({ page }, info) => {
    const errori = ascolta(page);
    await entra(page);
    await page.goto(s.percorso);
    await fermo(page);
    if (s.prima) { await s.prima(page); await fermo(page); }
    expect(await controlla(page, info.project.name as "tel" | "desk")).toEqual([]);
    expect(errori).toEqual([]);
    // Il flusso salva esito e cambio di fase con l'ora vera del server, nello stesso istante: più in basso nel Diario
    // il loro ordine dipende dall'id casuale. Del Diario si fotografa solo la prima schermata, con le ore e le voci
    // del lead del flusso coperte (sul computer entrano nella prima schermata).
    const diario = s.nome === "diario";
    const flusso = page.locator("li").filter({ hasText: "Car Service Cambiolesto" });
    const mask = [page.getByText(DATA), ...(diario ? [page.getByText(ORA_VERA), flusso] : [])];
    await expect(page).toHaveScreenshot(`${s.nome}.png`, { fullPage: !diario, mask });
  });
}

test("niente animazioni con prefers-reduced-motion", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await entra(page);
  await fermo(page);
  await page.getByRole("region", { name: "Adesso" }).getByRole("button", { name: "Esito" }).click();
  // Con l'orologio fermo di entra() la linea del tempo non avanza: un'animazione da 0,01 ms resta "running".
  // Conta quindi le animazioni che durano davvero (lo spinner è l'unico moto ammesso, e qui non c'è).
  const attive = await page.evaluate(() => document.getAnimations().filter((a) => Number(a.effect?.getTiming().duration ?? 0) > 1).length);
  expect(attive).toBe(0);
  const transizioni = await page.evaluate(() => [...document.querySelectorAll("button, a, dialog")].filter((e) => parseFloat(getComputedStyle(e).transitionDuration) > 0.01).length);
  expect(transizioni).toBe(0);
  await ctx.close();
});
