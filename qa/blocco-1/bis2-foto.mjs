// Blocco 1 bis, seconda passata: foto della tabella Lead con le 12 fasi (una per lead demo-lead-<fase>).
// Nessun segmento mostra tutte le fasi insieme: si fotografano Aperti (9 fasi) e Chiusi (3 fasi) con le sole righe
// demo-lead-<fase> (le copie -bis della demo nascoste a schermo) e si mettono una sotto l'altra in un PNG solo.
// Uso: node qa/blocco-1/bis2-foto.mjs [porta] [password]
import { chromium } from "playwright";

const porta = process.argv[2] ?? "5210";
const password = process.argv[3] ?? "password-demo-locale-e2e";
const ORA = Date.UTC(2026, 9, 12, 8, 0);
const base = `http://localhost:${porta}`;

const browser = await chromium.launch();
for (const [nome, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "it-IT", timezoneId: "Europe/Rome", deviceScaleFactor: nome === "390" ? 2 : 1 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(ORA);
  await page.goto(base + "/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
  const parti = [];
  for (const seg of ["", "?seg=chiusi"]) {
    await page.goto(base + "/commerciale/lead" + seg);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const visibili = [];
      for (const r of document.querySelectorAll("[data-lead]")) {
        const riga = r.closest("tr, li") ?? r;
        if (/^demo-lead-\d+$/.test(r.getAttribute("data-lead") ?? "")) { if (r.getBoundingClientRect().height > 0) visibili.push(r.getAttribute("data-lead")); }
        else riga.style.display = "none";
      }
      const th = [...document.querySelectorAll("thead th")].map((t) => t.textContent);
      const azioni = document.querySelector("tbody tr td:last-child")?.getBoundingClientRect().width;
      return { visibili, th, azioni: azioni && Math.round(azioni) };
    });
    console.log(nome, seg || "aperti", JSON.stringify(info));
    parti.push((await page.screenshot({ fullPage: true })).toString("base64"));
  }
  // Le due foto una sotto l'altra.
  const unione = await ctx.newPage();
  await unione.setContent(`<body style="margin:0;background:#fff">${parti.map((b) => `<img style="display:block;width:${vp.width}px" src="data:image/png;base64,${b}">`).join('<div style="height:8px;background:#1d1d1b"></div>')}</body>`);
  await unione.waitForTimeout(300);
  await unione.screenshot({ path: `qa/blocco-1/bis2-lead-${nome}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
