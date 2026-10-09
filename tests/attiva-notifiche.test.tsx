import { describe, expect, it } from "vitest";
import { AttivaNotifiche } from "../src/pagine/impostazioni/AttivaNotifiche";
import { contaPrimari, render } from "./render";

const dati: [unknown[], unknown][] = [[["push-chiave"], { chiave: "BAAA" }], [["push-dispositivi"], { dispositivi: [] }]];
describe("AttivaNotifiche", () => {
  it("iPhone fuori dalla Home: tre passi e nessun pulsante", async () => {
    const html = await render(<AttivaNotifiche ambiente={{ ua: "iPhone", standalone: false, haPush: false, permesso: "assente" }} />, { percorso: "/impostazioni/profilo", dati: [...dati] });
    expect(html).toContain("Aggiungi alla schermata Home");
    expect(html).not.toContain("Attiva le notifiche su questo dispositivo");
  });
  it("computer: pulsante secondario, mai primario", async () => {
    const html = await render(<AttivaNotifiche ambiente={{ ua: "Macintosh Chrome/129", standalone: false, haPush: true, permesso: "default" }} />, { percorso: "/impostazioni/profilo", dati: [...dati] });
    expect(html).toContain("Attiva le notifiche su questo dispositivo");
    expect(contaPrimari(html)).toBe(0);
  });
  it("senza chiave VAPID: pulsante spento e messaggio calmo, nessun errore", async () => {
    const html = await render(<AttivaNotifiche ambiente={{ ua: "Macintosh Chrome/129", standalone: false, haPush: true, permesso: "default" }} />, { percorso: "/impostazioni/profilo", dati: [[["push-chiave"], { chiave: null }], [["push-dispositivi"], { dispositivi: [] }]] });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Le notifiche non sono ancora collegate");
    expect(html).not.toMatch(/errore/i);
  });
  it("permesso negato: spiega, nessun pulsante", async () => {
    const html = await render(<AttivaNotifiche ambiente={{ ua: "Macintosh Chrome/129", standalone: false, haPush: true, permesso: "denied" }} />, { percorso: "/impostazioni/profilo", dati: [...dati] });
    expect(html).toContain("bloccate");
    expect(html).not.toContain("Attiva le notifiche su questo dispositivo");
  });
  it("dispositivi: una riga ciascuno, il rotto lo dice", async () => {
    const dispositivi = [
      { id: "a", etichetta: "iPhone, Safari", createdAt: 1, lastOkAt: null, rotta: true },
      { id: "b", etichetta: "Mac, Chrome", createdAt: 1, lastOkAt: null, rotta: false },
    ];
    const html = await render(<AttivaNotifiche ambiente={{ ua: "Macintosh Chrome/129", standalone: false, haPush: true, permesso: "default" }} />, { percorso: "/impostazioni/profilo", dati: [[["push-chiave"], { chiave: "BAAA" }], [["push-dispositivi"], { dispositivi }]] });
    expect(html).toContain("iPhone, Safari");
    expect(html).toContain("Non risponde, rimuovilo e riattiva");
    expect((html.match(/Rimuovi il dispositivo/g) ?? []).length).toBe(2);
    expect(contaPrimari(html)).toBe(0);
  });
});
