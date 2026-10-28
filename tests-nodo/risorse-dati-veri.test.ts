// Gira in Node puro (vitest.nodo.config.ts): il runtime del Worker non vede i file del computer.
// In `npm test` legge la copia delle risorse salvata nel repo (tests-nodo/fixture), uguale su ogni computer.
// Per confrontare il gestionale con il file vivo delle risorse: RISORSE_FILE=<file.json> npm run controlla:risorse
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAFICHE } from "../worker/risponditore/grafiche-risorse";
import { firmaGrafiche, passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";

const RADICE = resolve(import.meta.dirname, "..");
const FILE_RISORSE = process.env.RISORSE_FILE ?? join(import.meta.dirname, "fixture/risorse-risponditore.json");

describe("anteprime e dati veri delle risorse", () => {
  it("ogni risorsa ha la sua anteprima, disegnata sul titolo e sui passi di oggi", () => {
    const { risorse } = JSON.parse(readFileSync(FILE_RISORSE, "utf8")) as { risorse: { slug: string; titolo: string; corpo: string }[] };
    expect(risorse.length).toBeGreaterThan(0);
    for (const r of risorse) {
      expect(GRAFICHE[r.slug], `${r.slug}: voce mancante in GRAFICHE`).toBeDefined();
      expect(GRAFICHE[r.slug].firma, `${r.slug}: titolo o passi cambiati, rigenerare`).toBe(firmaGrafiche(r.titolo, passiSchema(r.corpo)));
      expect(readdirSync(join(RADICE, "public/risorse", r.slug)), `${r.slug}: file`).toEqual(["anteprima.png"]);
    }
  });
});
