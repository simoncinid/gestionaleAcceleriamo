// Gira in Node puro (vitest.nodo.config.ts): il runtime del Worker non vede i file del computer.
// In `npm test` legge la copia delle risorse salvata nel repo (tests-nodo/fixture), uguale su ogni computer.
// Per confrontare il gestionale con il file vivo delle risorse: RISORSE_FILE=<file.json> npm run controlla:risorse
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAFICHE } from "../worker/risponditore/grafiche-risorse";
import { firmaPassi, passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";

const RADICE = resolve(import.meta.dirname, "..");
const FILE_RISORSE = process.env.RISORSE_FILE ?? join(import.meta.dirname, "fixture/risorse-risponditore.json");

describe("grafiche e dati veri delle risorse", () => {
  it("ogni risorsa con uno schema ha le sue grafiche e il numero dei passi coincide", () => {
    const { risorse } = JSON.parse(readFileSync(FILE_RISORSE, "utf8")) as { risorse: { slug: string; corpo: string }[] };
    expect(risorse.length).toBeGreaterThan(0);
    for (const r of risorse) {
      const passi = passiSchema(r.corpo);
      if (!passi.length) {
        expect(GRAFICHE[r.slug], `${r.slug} non ha uno schema`).toBeUndefined();
        continue;
      }
      expect(GRAFICHE[r.slug], `${r.slug}: voce mancante in GRAFICHE`).toBeDefined();
      expect(GRAFICHE[r.slug].firma, `${r.slug}: firma dei passi cambiata`).toBe(firmaPassi(passi));
      expect(GRAFICHE[r.slug].video, `${r.slug}: animazione`).toBe(true);
      const file = readdirSync(join(RADICE, "public/risorse", r.slug)).sort();
      const attesi = [...passi.map((p) => `passo-${p.numero}.png`), "chiamata.png", "schema.mp4"].sort();
      expect(file, `${r.slug}: file`).toEqual(attesi);
    }
  });
});
