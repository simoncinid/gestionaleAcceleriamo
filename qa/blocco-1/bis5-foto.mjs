// Blocco 1 bis: barra laterale richiudibile. Prove di comportamento e foto a 1440 e 390.
// Uso: node qa/blocco-1/bis5-foto.mjs [porta] [password]
import { chromium } from "playwright";

const porta = process.argv[2] ?? "5210";
const password = process.argv[3] ?? "password-demo-locale-e2e";
const base = `http://localhost:${porta}`;
const browser = await chromium.launch();
const ok = (cond, testo) => console.log(cond ? "OK  " : "NO  ", testo);

const entra = async (page) => {
  await page.goto(base + "/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
  await page.goto(base + "/commerciale/lead");
  await page.waitForSelector("main table, main h1");
  await page.waitForLoadState("networkidle");
};
const largo = (page) => page.locator("#barra-laterale").evaluate((el) => Math.round(el.getBoundingClientRect().width));
const tabella = (page) => page.locator("main").evaluate((el) => Math.round(el.getBoundingClientRect().width));

// Computer, Mac: piattaforma per il suggerimento ⌘B.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT", timezoneId: "Europe/Rome" });
const page = await ctx.newPage();
await entra(page);
await page.evaluate(() => localStorage.removeItem("acceleriamo-os:barra-ridotta"));
await page.reload(); await page.waitForLoadState("networkidle");
const apertaL = await largo(page), mainAperta = await tabella(page);
ok(apertaL === 256, `aperta di default: ${apertaL} px, contenuto ${mainAperta} px`);
await page.screenshot({ path: "qa/blocco-1/bis5-barra-aperta-1440.png" });

const chiudi = page.getByRole("button", { name: "Chiudi la barra laterale" });
ok((await chiudi.getAttribute("aria-expanded")) === "true", "pulsante « con aria-expanded=true");
await chiudi.hover(); await page.waitForTimeout(500);
console.log("     suggerimento:", await page.locator('[role="tooltip"]').textContent());
await chiudi.click(); await page.waitForTimeout(400);
const rid = await largo(page), mainRid = await tabella(page);
ok(rid === 64, `ridotta: ${rid} px, contenuto ${mainRid} px (+${mainRid - mainAperta})`);
ok((await page.evaluate(() => localStorage.getItem("acceleriamo-os:barra-ridotta"))) === "1", "salvata nel browser");

// Ricarica: nessuno sfarfallio, la barra nasce già stretta (prima larghezza vista dal MutationObserver).
await ctx.addInitScript(() => {
  window.__visti = [];
  new MutationObserver(() => { const a = document.getElementById("barra-laterale"); if (a && window.__visti.length < 3) window.__visti.push(Math.round(a.getBoundingClientRect().width)); })
    .observe(document, { childList: true, subtree: true });
});
await page.reload(); await page.waitForSelector("#barra-laterale"); await page.waitForLoadState("networkidle");
const visti = await page.evaluate(() => window.__visti);
ok(visti[0] === 64 && visti.every((v) => v === 64), `dopo ricarica la barra nasce a ${visti.join(", ")} px`);

// Suggerimento su un'icona, poi menu a comparsa al passaggio e al clic.
await page.getByRole("button", { name: "Cerca" }).hover(); await page.waitForTimeout(500);
console.log("     suggerimento lente:", await page.locator('[role="tooltip"]').textContent());
const comm = page.locator('[data-area="commerciale"]');
await comm.hover(); await page.waitForTimeout(250);
ok(await page.getByRole("menu", { name: "Commerciale" }).isVisible(), "menu al passaggio del mouse");
await page.mouse.move(700, 450); await page.waitForTimeout(400);
ok(!(await page.getByRole("menu").count()), "si richiude lasciando icona e menu");
await comm.click(); await page.waitForTimeout(250);
const voci = await page.getByRole("menuitem").allTextContents();
ok(voci.join(",") === "Oggi,Lead,Call,Proposte,Clienti,Numeri", `voci: ${voci.join(", ")}`);
ok((await page.getByRole("menuitem", { name: "Lead" }).getAttribute("aria-current")) === "page", "Lead evidenziata");
await page.mouse.move(700, 450); await page.waitForTimeout(300);
ok(await page.getByRole("menu").isVisible(), "dopo il clic resta aperto anche col mouse fuori");
await page.getByRole("menuitem", { name: "Lead" }).hover();
await page.screenshot({ path: "qa/blocco-1/bis5-barra-menu-1440.png" });
await page.keyboard.press("Escape"); await page.waitForTimeout(150);
ok(!(await page.getByRole("menu").count()), "Esc chiude");
ok(await comm.evaluate((el) => el === document.activeElement), "fuoco torna sull'icona");
await comm.click(); await page.mouse.click(900, 500); await page.waitForTimeout(150);
ok(!(await page.getByRole("menu").count()), "clic fuori chiude");
await comm.click(); await page.getByRole("menuitem", { name: "Call" }).click(); await page.waitForURL(/\/commerciale\/call/);
ok(!(await page.getByRole("menu").count()), "clic su Call: naviga e chiude");

// Tastiera: Tab fino all'icona, Invio apre e porta il fuoco sulla prima voce, frecce, Esc.
await page.goto(base + "/commerciale/lead"); await page.waitForLoadState("networkidle");
await page.locator('[data-area="automazioni"]').focus();
await page.keyboard.press("Enter"); await page.waitForTimeout(150);
ok((await page.evaluate(() => document.activeElement?.textContent)) === "Pannello", "Invio: fuoco su Pannello");
await page.keyboard.press("ArrowDown");
ok((await page.evaluate(() => document.activeElement?.textContent)) === "In costruzione", "freccia giù: In costruzione");
await page.keyboard.press("Escape");
const etichette = [];
await page.locator("body").focus();
await page.locator("#barra-laterale button").first().focus();
for (let i = 0; i < 10; i++) { etichette.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))); await page.keyboard.press("Tab"); }
console.log("     ordine col Tab:", etichette.join(" > "));

// Scorciatoia: Cmd B riapre, Ctrl B richiude.
await page.locator("main").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Meta+b"); await page.waitForTimeout(100);
ok((await largo(page)) === 256, "Cmd B riapre (subito, senza animazione)");
await page.keyboard.press("Control+b"); await page.waitForTimeout(100);
ok((await largo(page)) === 64, "Ctrl B richiude");
await page.mouse.move(700, 450); await page.waitForTimeout(300);
await page.screenshot({ path: "qa/blocco-1/bis5-barra-ridotta-1440.png" });
ok(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches) === false, "movimento normale in questa prova");
await ctx.close();

// Movimento ridotto: nessuna transizione sulla larghezza.
const ctxR = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const pr = await ctxR.newPage(); await entra(pr);
const durata = await pr.locator("#barra-laterale").evaluate((el) => getComputedStyle(el).transitionDuration);
ok(parseFloat(durata) < 0.01, `prefers-reduced-motion: durata ${durata}`);
await ctxR.close();

// Telefono 390: la barra resta nascosta, il pulsante « non c'è, anche con la barra salvata ridotta.
const ctxT = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "it-IT", deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pt = await ctxT.newPage(); await entra(pt);
await pt.evaluate(() => localStorage.setItem("acceleriamo-os:barra-ridotta", "1"));
await pt.reload(); await pt.waitForLoadState("networkidle");
ok(!(await pt.locator("#barra-laterale").isVisible()), "390: barra laterale nascosta come prima");
ok(!(await pt.getByRole("button", { name: /barra laterale/ }).isVisible()), "390: nessun pulsante «");
await pt.screenshot({ path: "qa/blocco-1/bis5-barra-390.png" });
await ctxT.close();
await browser.close();
