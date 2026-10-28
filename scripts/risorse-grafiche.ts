// Uso: npm run risorse:grafiche -- <file.json> [--solo slug1,slug2]
// Legge il JSON di semina del risponditore (stesso formato di risponditore-semina.esempio.json) e, per ogni risorsa,
// disegna con Google Chrome (headless):
//   public/risorse/<slug>/anteprima.png   l'anteprima del link (1200x630): la vedono Instagram, WhatsApp e iMessage
// e riscrive worker/risponditore/grafiche-risorse.ts, che dice al Worker quali risorse hanno l'anteprima e in che versione.
// Richiede Google Chrome installato (o CHROME=/percorso/del/binario).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";
import { validaSemina } from "./lib/risponditore-semina";
import { ANTEPRIMA, htmlAnteprima, leggiModulo, moduloGrafiche, versioneGrafiche } from "./lib/risorse-grafiche";

const RADICE = resolve(import.meta.dirname, "..");
const FONT = join(RADICE, "public/fonts");
const ICONE = join(RADICE, "public/icone-3d");
const MODULO = join(RADICE, "worker/risponditore/grafiche-risorse.ts");
const LIMITE_PNG = 300 * 1024;

const argomenti = process.argv.slice(2);
const file = argomenti.find((a, i) => !a.startsWith("--") && argomenti[i - 1] !== "--solo");
const solo = argomenti.includes("--solo") ? new Set(argomenti[argomenti.indexOf("--solo") + 1].split(",")) : null;
if (!file) {
  console.error("Uso: npm run risorse:grafiche -- <file.json> [--solo slug1,slug2]");
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
  await pagina.setViewportSize({ width: ANTEPRIMA.larghezza, height: ANTEPRIMA.altezza });
  for (const r of risorse) {
    if (solo && !solo.has(r.slug)) continue;
    const passi = passiSchema(r.corpo);
    const cartella = join(RADICE, "public/risorse", r.slug);
    // La cartella si rifà da zero: spariscono anche le schede e i video del flusso di prima.
    rmSync(cartella, { recursive: true, force: true });
    mkdirSync(cartella, { recursive: true });
    const sorgente = join(lavoro, "anteprima.html");
    writeFileSync(sorgente, htmlAnteprima({ titolo: r.titolo, passi }, FONT, logo, ICONE));
    await pagina.goto(`file://${sorgente}`);
    // I font vanno caricati prima di misurare il titolo: con il font di riserva, più largo, verrebbe rimpicciolito per niente.
    await pagina.evaluate(async () => {
      await Promise.all(["500 100px Degular", "600 100px Degular"].map((f) => document.fonts.load(f)));
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)));
    });
    await pagina.evaluate(() => (window as any).adatta());
    const dove = join(cartella, "anteprima.png");
    await pagina.screenshot({ path: dove, type: "png" });
    if (statSync(dove).size > LIMITE_PNG) problemi.push(`${dove} pesa più di 300 KB`);
    voci[r.slug] = versioneGrafiche(r.titolo, passi);
    console.log(`${r.slug}: anteprima con ${Math.min(passi.length, 3)} nodi (${Math.round(statSync(dove).size / 1024)} KB)`);
  }
} finally {
  await browser.close();
  rmSync(lavoro, { recursive: true, force: true });
}
// Cartelle rimaste da risorse che non ci sono più nel file: le segnalo, non le cancello.
for (const slug of readdirSync(join(RADICE, "public/risorse"))) if (!voci[slug]) problemi.push(`public/risorse/${slug}: nessuna risorsa con questo slug`);
writeFileSync(MODULO, moduloGrafiche(voci));
console.log(`\nAnteprime pronte per ${Object.keys(voci).length} risorse. Dati per il Worker: worker/risponditore/grafiche-risorse.ts`);
for (const p of problemi) console.warn(`Attenzione: ${p}`);
if (problemi.length) process.exitCode = 1;
