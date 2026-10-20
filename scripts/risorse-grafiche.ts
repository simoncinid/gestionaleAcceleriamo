// Uso: npm run risorse:grafiche -- <file.json> [--solo slug1,slug2] [--senza-video]
// Legge il JSON di semina del risponditore (stesso formato di risponditore-semina.esempio.json) e, per ogni risorsa con uno
// schema a passi, disegna con Google Chrome (headless) e ffmpeg:
//   public/risorse/<slug>/passo-<n>.png   una scheda del carosello per passo (1200x628)
//   public/risorse/<slug>/chiamata.png    l'ultima scheda, la chiamata gratuita
//   public/risorse/<slug>/schema.mp4      l'animazione dello schema (1080x1350, muta, 8-14 s: titolo, un passo per volta, colonna finale)
// e riscrive worker/risponditore/grafiche-risorse.ts, che dice al Worker quali risorse hanno le grafiche.
// Richiede Google Chrome installato (o CHROME=/percorso/del/binario) e ffmpeg nel PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";
import { validaSemina } from "./lib/risponditore-semina";
import { htmlAnimazione, htmlChiamata, htmlPasso, leggiModulo, moduloGrafiche, SCHEDA, tempiAnimazione, versioneGrafiche, VIDEO } from "./lib/risorse-grafiche";

const RADICE = resolve(import.meta.dirname, "..");
const FONT = join(RADICE, "public/fonts");
const MODULO = join(RADICE, "worker/risponditore/grafiche-risorse.ts");
const LIMITE_PNG = 300 * 1024;
const LIMITE_VIDEO = 8 * 1024 * 1024;

const argomenti = process.argv.slice(2);
const file = argomenti.find((a, i) => !a.startsWith("--") && argomenti[i - 1] !== "--solo");
const solo = argomenti.includes("--solo") ? new Set(argomenti[argomenti.indexOf("--solo") + 1].split(",")) : null;
const senzaVideo = argomenti.includes("--senza-video");
if (!file) {
  console.error("Uso: npm run risorse:grafiche -- <file.json> [--solo slug1,slug2] [--senza-video]");
  process.exit(1);
}
const { risorse } = validaSemina(JSON.parse(readFileSync(file, "utf8")));
const logo = readFileSync(join(RADICE, "public/brand/logo.svg"), "utf8");

// Le voci già generate restano (si può rigenerare una risorsa sola); quelle senza più cartella spariscono.
const precedenti = Object.fromEntries(Object.entries(leggiModulo(readFileSync(MODULO, "utf8"))).filter(([slug]) => existsSync(join(RADICE, "public/risorse", slug))));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" });
const lavoro = mkdtempSync(join(tmpdir(), "risorse-grafiche-"));
const voci = { ...precedenti };
const problemi: string[] = [];
try {
  const pagina = await browser.newPage({ deviceScaleFactor: 1 });
  // I font vanno caricati prima di misurare i titoli: con il font di riserva, più largo, i titoli verrebbero rimpiccioliti per niente.
  const caricaFont = () => pagina.evaluate(async () => {
    await Promise.all(["500 100px Degular", "600 100px Degular", "500 40px Inter", "600 40px Inter"].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  });
  const fotografa = async (html: string, dove: string, w: number, h: number) => {
    const sorgente = join(lavoro, "pagina.html");
    writeFileSync(sorgente, html);
    await pagina.setViewportSize({ width: w, height: h });
    await pagina.goto(`file://${sorgente}`);
    await caricaFont();
    await pagina.evaluate(() => (window as any).adatta());
    await pagina.screenshot({ path: dove, type: "png" });
    if (statSync(dove).size > LIMITE_PNG) problemi.push(`${dove} pesa più di 300 KB`);
  };

  for (const r of risorse) {
    if (solo && !solo.has(r.slug)) continue;
    const passi = passiSchema(r.corpo);
    const cartella = join(RADICE, "public/risorse", r.slug);
    if (!passi.length) {
      console.log(`${r.slug}: nessuno schema a passi, niente grafiche`);
      rmSync(cartella, { recursive: true, force: true });
      delete voci[r.slug];
      continue;
    }
    rmSync(cartella, { recursive: true, force: true });
    mkdirSync(cartella, { recursive: true });
    for (const [i, p] of passi.entries()) await fotografa(htmlPasso(p, i, passi.length, FONT), join(cartella, `passo-${p.numero}.png`), SCHEDA.larghezza, SCHEDA.altezza);
    await fotografa(htmlChiamata(FONT), join(cartella, "chiamata.png"), SCHEDA.larghezza, SCHEDA.altezza);

    let video = false;
    if (!senzaVideo) {
      const fotogrammi = join(lavoro, r.slug);
      mkdirSync(fotogrammi, { recursive: true });
      writeFileSync(join(lavoro, "animazione.html"), htmlAnimazione({ titolo: r.titolo, passi }, FONT, logo));
      await pagina.setViewportSize({ width: VIDEO.larghezza, height: VIDEO.altezza });
      await pagina.goto(`file://${join(lavoro, "animazione.html")}`);
      await caricaFont();
      const misure = await pagina.evaluate(() => (window as any).prepara()) as { fsColonna: number; fsTitolo: number };
      if (misure.fsColonna < 44) problemi.push(`${r.slug}: la colonna finale scende a ${misure.fsColonna} px (minimo 44)`);
      if (misure.fsTitolo < 64) problemi.push(`${r.slug}: il titolo di apertura scende a ${misure.fsTitolo} px`);
      const { durata } = tempiAnimazione(passi.length);
      const n = Math.round(durata * VIDEO.fps);
      for (let f = 0; f < n; f++) {
        await pagina.evaluate((s) => (window as any).vaiA(s), f / VIDEO.fps);
        await pagina.screenshot({ path: join(fotogrammi, `${String(f).padStart(4, "0")}.png`), type: "png" });
      }
      const mp4 = join(cartella, "schema.mp4");
      execFileSync("ffmpeg", [
        "-loglevel", "error", "-y", "-framerate", String(VIDEO.fps), "-i", join(fotogrammi, "%04d.png"),
        "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4,
      ]);
      rmSync(fotogrammi, { recursive: true, force: true });
      video = true;
      if (statSync(mp4).size > LIMITE_VIDEO) problemi.push(`${mp4} pesa più di 8 MB`);
    }
    voci[r.slug] = { ...versioneGrafiche(passi), video };
    const peso = readdirSync(cartella).reduce((t, f) => t + statSync(join(cartella, f)).size, 0);
    console.log(`${r.slug}: ${passi.length} passi${video ? " e animazione" : ""} (${Math.round(peso / 1024)} KB)`);
  }
} finally {
  await browser.close();
  rmSync(lavoro, { recursive: true, force: true });
}
writeFileSync(MODULO, moduloGrafiche(voci));
console.log(`\nGrafiche pronte per ${Object.keys(voci).length} risorse. Dati per il Worker: worker/risponditore/grafiche-risorse.ts`);
for (const p of problemi) console.warn(`Attenzione: ${p}`);
if (problemi.length) process.exitCode = 1;
