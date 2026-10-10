// tests/pwa.test.ts
import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.webmanifest?raw";
import sw from "../public/sw.js?raw";
import main from "../src/main.tsx?raw";
import { etichettaDispositivo, statoPush } from "../src/push";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("manifest", () => {
  const m = JSON.parse(manifest);
  it("campi della spec 8.3", () => {
    expect(m).toMatchObject({ name: "Acceleriamo OS", short_name: "Acceleriamo", display: "standalone", start_url: "/commerciale/oggi", scope: "/", theme_color: "#1C1915", background_color: "#F7F2EC" });
    expect(m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? "any"}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
  });
});

describe("service worker", () => {
  it("non mette mai in cache le API", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toMatch(/startsWith\("\/api\/"\)\)\s*return;/);
  });
  it("gestisce push, clic e pagina offline", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("/offline.html");
  });
});

describe("statoPush", () => {
  const base = { ua: MAC_CHROME, standalone: false, haPush: true, permesso: "default" as const };
  it("iPhone fuori dalla Home: serve aggiungerla", () => {
    expect(statoPush({ ...base, ua: IPHONE, haPush: false }, false)).toBe("serve-home");
  });
  it("iPhone dalla Home: si può attivare", () => {
    expect(statoPush({ ...base, ua: IPHONE, standalone: true }, false)).toBe("da-attivare");
  });
  it("computer: da attivare, attivo, negato", () => {
    expect(statoPush(base, false)).toBe("da-attivare");
    expect(statoPush({ ...base, permesso: "granted" }, true)).toBe("attivo");
    expect(statoPush({ ...base, permesso: "denied" }, false)).toBe("negato");
  });
  it("browser senza push", () => {
    expect(statoPush({ ...base, haPush: false }, false)).toBe("non-supportato");
  });
  it("etichetta leggibile del dispositivo", () => {
    expect(etichettaDispositivo(IPHONE)).toBe("iPhone, Safari");
    expect(etichettaDispositivo(MAC_CHROME)).toBe("Mac, Chrome");
  });
});

describe("iPad e registrazione", () => {
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  it("iPad che si presenta come Mac: tre passi, non 'non supportato'", () => {
    expect(statoPush({ ua: IPAD, standalone: false, haPush: false, permesso: "assente", tocco: true }, false)).toBe("serve-home");
    expect(statoPush({ ua: IPAD, standalone: false, haPush: false, permesso: "assente", tocco: false }, false)).toBe("non-supportato");
    expect(etichettaDispositivo(IPAD, true)).toBe("iPad, Safari");
  });
  it("il service worker si registra solo in produzione", () => {
    expect(main).toMatch(/if \(import\.meta\.env\.PROD && "serviceWorker" in navigator\) \{\s*window\.addEventListener\("load", \(\) => navigator\.serviceWorker\.register\("\/sw\.js"\)/);
    expect(main.match(/serviceWorker\.register/g)).toHaveLength(1);
  });
  it("pagina offline mancante dalla cache: errore di rete, mai undefined", () => {
    expect(sw).toContain("r || Response.error()");
  });
});
