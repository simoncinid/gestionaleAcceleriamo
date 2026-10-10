import { expect, type Page } from "@playwright/test";

// Lunedì 12 ottobre 2026, 10:00 a Roma (UTC+2): giorno feriale, dentro l'orario di lavoro, banner del Lunedì visibile.
export const ORA_DEMO = Date.UTC(2026, 9, 12, 8, 0);
// Password solo del database locale della demo, che vive sul computer di chi gira i test.
export const PASSWORD_DEMO = "password-demo-locale-e2e";
// Date assolute ("12 ott", "lunedì 12 ottobre"): si coprono nelle foto.
export const DATA = /\b\d{1,2} (gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i;

export async function entra(page: Page) {
  await page.clock.setFixedTime(ORA_DEMO);
  await page.goto("/");
  await page.getByLabel("Utente").fill("demo");
  await page.getByLabel("Password").fill(PASSWORD_DEMO);
  await page.getByRole("button", { name: "Entra" }).click();
  await page.waitForURL(/\/commerciale\/oggi/);
}

// Spec 19.2: i controlli automatici di ogni schermata. Restituisce i problemi in parole semplici.
// Rispetto alla prima stesura (QA del Task 15): colori letti con una tela (Tailwind 4 scrive in oklch),
// a foglio aperto conta solo il foglio, la barra in basso è quella visibile, la casella dentro una label
// si misura sulla label, sul computer il bersaglio minimo è 24 px (WCAG 2.2, 2.5.8).
export async function controlla(page: Page, misura: "tel" | "desk"): Promise<string[]> {
  return page.evaluate((misura) => {
    const problemi: string[] = [];
    const modale = document.querySelector("dialog[open]");
    const visibile = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"
        && !e.closest("[aria-hidden=true], .sr-only, [inert]") && (!modale || modale.contains(e));
    };
    const nome = (e: Element) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    const tela = document.createElement("canvas");
    tela.width = tela.height = 1;
    const cx = tela.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, number[]>();
    const rgb = (col: string) => {
      const c = cache.get(col);
      if (c) return c;
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = col;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
      const v = [r, g, b, a / 255];
      cache.set(col, v);
      return v;
    };

    // 1. Nessuno scorrimento orizzontale.
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) problemi.push(`scorrimento orizzontale: ${document.documentElement.scrollWidth}px`);

    // 2. Bersagli: 44 × 44 sul telefono (40 dentro righe da 60), 24 × 24 sul computer. I link dentro un paragrafo sono testo.
    for (const e of document.querySelectorAll("button, a[href], [role=button], [role=switch], input[type=checkbox], input[type=radio]")) {
      if (!visibile(e) || e.closest("p")) continue;
      const etichetta = e.matches("input") ? e.closest("label") : null;
      // Link "a tutta card" (after:absolute after:inset-0): il bersaglio vero è il riquadro che lo contiene.
      const dopo = getComputedStyle(e, "::after");
      const tutto = dopo.content !== "none" && dopo.position === "absolute" && e instanceof HTMLElement ? e.offsetParent : null;
      const r = (etichetta ?? tutto ?? e).getBoundingClientRect();
      const riga = e.closest("li");
      const minimo = misura === "desk" ? 24 : riga && riga.getBoundingClientRect().height >= 60 ? 40 : 44;
      if (r.width < minimo - 0.5 || r.height < minimo - 0.5) problemi.push(`bersaglio piccolo ${Math.round(r.width)}×${Math.round(r.height)}: ${nome(e)}`);
    }

    // 3. Un solo pulsante pieno per schermata (a foglio aperto, uno nel foglio).
    const pieni = [...document.querySelectorAll('[data-variante="primario"], [data-variante="su-accento"]')].filter(visibile);
    if (pieni.length > 1) problemi.push(`pulsanti pieni: ${pieni.map(nome).join(", ")}`);

    // 4 e 5. Telefono: barra in basso con le tre aree in ordine, senza "+"; "+" nella testata.
    if (misura === "tel" && location.pathname !== "/" && !modale) {
      const barra = [...document.querySelectorAll('nav[aria-label="Aree"]')].find(visibile);
      const voci = barra ? [...barra.querySelectorAll("a")].map((a) => (a as HTMLElement).innerText.trim().split("\n")[0]) : [];
      if (voci.join("|") !== "Commerciale|Automazioni|Economia") problemi.push(`barra in basso: ${voci.join(", ") || "assente"}`);
      if (barra?.querySelector('[aria-label^="Crea"]')) problemi.push('"+" nella barra in basso');
      const piu = [...document.querySelectorAll('header [aria-label^="Crea in"]')].filter(visibile);
      if (piu.length !== 1) problemi.push('"+" assente dalla testata');
    }

    // 6. Nessuna griglia di chip di scelta: più di 3 chip sorelle sono un selettore da fare a espansione.
    for (const contenitore of document.querySelectorAll("*")) {
      const chip = [...contenitore.children].filter((c) => c.hasAttribute("aria-pressed") && visibile(c));
      if (chip.length > 3) problemi.push(`griglia di ${chip.length} chip: ${chip.slice(0, 3).map(nome).join(", ")}...`);
    }

    // 7. Contrasto WCAG del testo sul suo fondo effettivo.
    const lum = ([r, g, b]: number[]) => {
      const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const fondo = (e: Element | null): number[] => {
      for (let x = e; x; x = x.parentElement) {
        const c = rgb(getComputedStyle(x).backgroundColor);
        if (c[3] > 0.5) return c;
      }
      return [255, 255, 255];
    };
    const visti = new Set<string>();
    for (const e of document.querySelectorAll("body *")) {
      const testo = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!testo || !visibile(e) || e.closest("[aria-disabled=true], :disabled")) continue;
      const s = getComputedStyle(e);
      const a = lum(rgb(s.color));
      const b = lum(fondo(e));
      const rapporto = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const px = parseFloat(s.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
      const chiave = `${s.color}|${fondo(e).join(",")}`;
      if (rapporto < (grande ? 3 : 4.5) && !visti.has(chiave)) {
        visti.add(chiave);
        problemi.push(`contrasto ${rapporto.toFixed(2)}: "${nome(e)}"`);
      }
    }

    // 8. Niente lineette lunghe o medie né emoji nel testo.
    const tutto = document.body.innerText;
    const lineette = tutto.match(/.{0,20}[\u2013\u2014].{0,20}/g);
    if (lineette) problemi.push(`lineette: ${lineette.slice(0, 3).join(" / ")}`);
    const emoji = tutto.match(/\p{Extended_Pictographic}/gu);
    if (emoji) problemi.push(`emoji: ${[...new Set(emoji)].join(" ")}`);
    return problemi;
  }, misura);
}

export async function fermo(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  // In vite dev la prima visita di una rotta può ricaricare la pagina (dipendenze ottimizzate al volo):
  // dopo l'accesso si aspetta che il guscio sia di nuovo a schermo, poi si controlla.
  if (new URL(page.url()).pathname !== "/") await expect(page.locator('header [aria-label^="Crea in"], aside button[data-variante="secondario"]').filter({ visible: true }).first()).toBeVisible();
  // Le entrate in dissolvenza devono finire prima dei controlli: a metà animazione il guscio risulta invisibile.
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]));
}
