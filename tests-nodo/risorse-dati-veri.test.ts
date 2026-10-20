// Gira in Node puro (vitest.nodo.config.ts): il runtime del Worker non vede i file del computer.
// Solo lettura del file delle 17 risorse; se il file non c'è (altro computer) il test si salta.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAFICHE } from "../worker/risponditore/grafiche-risorse";
import { firmaPassi, passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";

const FILE_RISORSE = "/Users/tommasorovini/agente/companies/acceleriamo/crescita/video-hyperframes/risorse-risponditore.json";
const RADICE = resolve(import.meta.dirname, "..");

describe.skipIf(!existsSync(FILE_RISORSE))("grafiche e dati veri delle risorse", () => {
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
