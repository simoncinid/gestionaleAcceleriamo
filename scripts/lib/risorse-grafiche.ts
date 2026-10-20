// Pezzi puri dello script delle grafiche del risponditore (scripts/risorse-grafiche.ts): le pagine HTML da fotografare
// con Chrome (una scheda per passo, la scheda della chiamata, l'animazione dello schema), i tempi dell'animazione e il
// file dei dati per il Worker. Nessun accesso a disco o a Chrome qui: così si prova con vitest.
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BellRinging, CalendarCheck, Camera, ChartBar, ChatCircleDots, CheckCircle, Clock, Envelope, FileText, Globe,
  ListChecks, MapPin, Phone, Receipt, ShareNetwork, Table, UserSwitch, WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import { chiaveTitolo, firmaPassi, type Passo } from "../../src/pagine/pubbliche/corpoRisorsa";

// Cambia questo numero quando cambia il disegno: cambiano gli indirizzi e Instagram non mostra le immagini vecchie.
export const DESIGN_VERSIONE = 1;

export const COLORI = { arancione: "#EC5E2D", crema: "#F7F2EC", testo: "#1C1915", sabbia: "#E3DCD2", grigio: "#6B645C" };
export const SCHEDA = { larghezza: 1200, altezza: 628 }; // 1.91:1, il formato delle schede dei messaggi
export const VIDEO = { larghezza: 1080, altezza: 1350, fps: 30 }; // 4:5, verticale come il telefono

// Curve: entrate con ease-out forte, niente rimbalzi.
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// In Degular l'apostrofo dritto si stacca dalle lettere: si usa quello tipografico (come nella pagina); anche le virgolette diventano tipografiche.
const apostrofo = (s: string) => s.replace(/'/g, "\u2019").replace(/"([^"]*)"/g, "\u201c$1\u201d");

const VUOTE = new Set("il lo la i gli le un uno una di a da in con su per tra fra e o che chi non si ti ci al allo alla ai agli alle del dello della dei degli delle dal dalla nel nella sul sulla come cosa ogni quando".split(" "));

// La parola chiave del titolo di un passo, in arancione: la parola piena più lunga (a parità, la prima).
export function chiavePasso(titolo: string): [string, string, string] {
  const parole = [...titolo.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
  let migliore: RegExpMatchArray | null = null;
  for (const m of parole) {
    const p = m[0].toLocaleLowerCase("it").replace(/^\p{L}+['’]/u, "");
    if (VUOTE.has(p)) continue;
    if (!migliore || m[0].length > migliore[0].length) migliore = m;
  }
  if (!migliore) return [titolo, "", ""];
  // "dell'agente": in arancione solo "agente", l'articolo apostrofato resta nero.
  const elisione = /^\p{L}+['’]/u.exec(migliore[0])?.[0].length ?? 0;
  const i = migliore.index! + elisione;
  const parola = migliore[0].slice(elisione);
  return [titolo.slice(0, i), parola, titolo.slice(i + parola.length)];
}

const conChiave = ([prima, chiave, dopo]: [string, string, string]) =>
  `${escape(apostrofo(prima))}${chiave ? `<span class="chiave">${escape(apostrofo(chiave))}</span>` : ""}${escape(apostrofo(dopo))}`;

// L'icona del passo, scelta dalle parole del titolo e della descrizione; in mancanza, una lista spuntata.
const ICONE: [RegExp, ComponentType<any>][] = [
  [/whatsapp/i, WhatsappLogo],
  [/\bpec\b|e-?mail/i, Envelope],
  [/telefon|chiamat|chiama\b|richiam/i, Phone],
  [/preventiv|listino|pagament|fattur/i, Receipt],
  [/promemoria|avvis|ricord|sollecit/i, BellRinging],
  [/agenda|appuntament|calendari|scadenz|prenot|orari/i, CalendarCheck],
  [/report|riepilog|conteggi|misur|vendite|numeri/i, ChartBar],
  [/document|rapportin|scheda|pratica|modul|archivi/i, FileText],
  [/portal|sito|\bweb\b|online/i, Globe],
  [/foto/i, Camera],
  [/giro|zona|indirizz|percors/i, MapPin],
  [/collega|passagg|giusto|assegn|smist|agente/i, UserSwitch],
  [/messagg|scrive|rispost|chat|comunicazion/i, ChatCircleDots],
  [/registr|dati|gestional|excel|elenco|storico/i, Table],
  [/tempo|\bore\b|minuti|giorn/i, Clock],
  [/regol|decid|conferm|fatt[ao]\b/i, CheckCircle],
  [/condivi|team|tutti/i, ShareNetwork],
];
export function iconaPasso(p: Passo, colore: string, misura: number): string {
  const testo = `${p.titolo} ${p.descrizione}`;
  const Icona = ICONE.find(([re]) => re.test(p.titolo))?.[1] ?? ICONE.find(([re]) => re.test(testo))?.[1] ?? ListChecks;
  return renderToStaticMarkup(createElement(Icona, { size: misura, color: colore, weight: "regular" }));
}

// Il filo del logo: una linea arancione con le punte tonde che finisce in una freccia aperta.
const freccia = (x: number, y: number, verso: "destra" | "basso", lato = 34) => {
  const p = verso === "destra" ? `M ${x - lato} ${y - lato} L ${x} ${y} L ${x - lato} ${y + lato}` : `M ${x - lato} ${y - lato} L ${x} ${y} L ${x + lato} ${y - lato}`;
  return `<path d="${p}" fill="none" stroke="${COLORI.arancione}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const font = (cartellaFont: string) => `
  @font-face { font-family: "Degular"; src: url("file://${cartellaFont}/DegularDisplay-Medium.otf"); font-weight: 500; }
  @font-face { font-family: "Degular"; src: url("file://${cartellaFont}/DegularDisplay-Semibold.otf"); font-weight: 600; }
  @font-face { font-family: "Inter"; src: url("file://${cartellaFont}/Inter-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "Inter"; src: url("file://${cartellaFont}/Inter-SemiBold.ttf"); font-weight: 600; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; -webkit-font-smoothing: antialiased; }
  .chiave { color: ${COLORI.arancione}; }
  svg { display: block; }`;

// Il testo dentro un riquadro si rimpicciolisce finché ci sta (data-adatta="min"): i titoli lunghi restano interi.
const ADATTA = `<script>
  window.adatta = () => {
    for (const el of document.querySelectorAll("[data-adatta]")) {
      const min = Number(el.dataset.adatta);
      const dentro = el.firstElementChild;
      let px = parseFloat(getComputedStyle(el).fontSize);
      const esce = () => dentro.getBoundingClientRect().height > el.clientHeight + 1 || dentro.scrollWidth > el.clientWidth + 1;
      while (esce() && px > min) {
        px -= 2;
        el.style.fontSize = px + "px";
      }
    }
  };
</script>`;

// Una scheda del carosello: numero enorme a sinistra, titolo del passo grande con la parola chiave, icona, e il filo
// che attraversa la scheda alla stessa altezza in tutte: scorrendo il carosello sembra un filo solo.
export function htmlPasso(p: Passo, indice: number, totale: number, cartellaFont: string): string {
  const { larghezza: W, altezza: H } = SCHEDA;
  const yFilo = 540;
  const primo = indice === 0;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${font(cartellaFont)}
  body { background: ${COLORI.crema}; color: ${COLORI.testo}; position: relative; width: ${W}px; height: ${H}px; }
  .numero { position: absolute; left: 52px; top: 10px; font: 500 420px/1 "Degular"; letter-spacing: -0.04em; color: ${COLORI.arancione}; }
  .di { position: absolute; left: 404px; top: 62px; font: 600 36px/1 "Inter"; color: ${COLORI.grigio}; }
  .icona { position: absolute; right: 64px; top: 40px; width: 112px; height: 112px; border-radius: 999px; background: #FEFDF9; border: 3px solid ${COLORI.sabbia}; display: grid; place-items: center; }
  .titolo { position: absolute; left: 400px; right: 56px; top: 140px; height: 350px; display: flex; align-items: flex-end; font: 500 108px/0.92 "Degular"; letter-spacing: -0.015em; word-spacing: 0.04em; text-transform: lowercase; overflow: hidden; }
  .titolo span.t { display: block; }
  svg.fondo { position: absolute; inset: 0; }
  </style>${ADATTA}</head><body>
  <svg class="fondo" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${primo ? 120 : -20}" y1="${yFilo}" x2="${W + 20}" y2="${yFilo}" stroke="${COLORI.arancione}" stroke-width="14" stroke-linecap="round"/>
    ${primo ? `<circle cx="120" cy="${yFilo}" r="15" fill="${COLORI.arancione}"/>` : ""}
  </svg>
  <div class="numero">${p.numero}</div>
  <div class="di">passo ${indice + 1} di ${totale}</div>
  <div class="icona">${iconaPasso(p, COLORI.testo, 64)}</div>
  <div class="titolo" data-adatta="60"><span class="t">${conChiave(chiavePasso(apostrofo(p.titolo)))}</span></div>
  </body></html>`;
}

// L'ultima scheda: la chiamata gratuita, su arancione pieno. Il filo arriva da sinistra e finisce con la freccia.
export function htmlChiamata(cartellaFont: string): string {
  const { larghezza: W, altezza: H } = SCHEDA;
  const yFilo = 540;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${font(cartellaFont)}
  body { background: ${COLORI.arancione}; color: ${COLORI.testo}; position: relative; width: ${W}px; height: ${H}px; }
  .titolo { position: absolute; left: 72px; top: 64px; font: 500 156px/0.86 "Degular"; letter-spacing: -0.03em; text-transform: lowercase; }
  .titolo .crema { color: ${COLORI.crema}; display: block; }
  .riga { position: absolute; left: 76px; top: 362px; width: 760px; font: 500 40px/1.2 "Inter"; }
  .icona { position: absolute; right: 72px; top: 72px; width: 176px; height: 176px; border-radius: 999px; background: ${COLORI.crema}; display: grid; place-items: center; }
  svg.fondo { position: absolute; inset: 0; }
  </style>${ADATTA}</head><body>
  <svg class="fondo" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="-20" y1="${yFilo}" x2="${W - 140}" y2="${yFilo}" stroke="${COLORI.crema}" stroke-width="14" stroke-linecap="round"/>
    ${freccia(W - 140, yFilo, "destra").replace(COLORI.arancione, COLORI.crema)}
  </svg>
  <div class="titolo">chiamata<span class="crema">gratuita</span></div>
  <p class="riga">Ti richiamiamo e guardiamo insieme come applicarlo alla tua azienda.</p>
  <div class="icona">${renderToStaticMarkup(createElement(Phone, { size: 96, color: COLORI.arancione, weight: "regular" }))}</div>
  </body></html>`;
}

// Tempi dell'animazione, in secondi: il titolo, poi un passo ogni 0,9 s con il filo che scende fino a lui,
// la freccia in fondo, una pausa per leggere e un'uscita breve. Primo e ultimo fotogramma sono uguali (crema e logo): il giro è continuo.
export function tempiAnimazione(passi: number) {
  const titolo = 0.2;
  const primoPasso = 1.0;
  const intervallo = 0.9;
  const ultimo = primoPasso + (passi - 1) * intervallo;
  const freccia = ultimo + 0.6;
  const uscita = freccia + 0.6 + 3.2;
  const durata = uscita + 0.6;
  return { titolo, primoPasso, intervallo, freccia, uscita, durata };
}

// L'animazione dello schema: logo, titolo della risorsa e i passi che entrano uno dopo l'altro, con il filo che li cuce.
// Le animazioni CSS restano ferme: lo script porta ogni fotogramma al suo tempo (document.getAnimations) e lo fotografa.
export function htmlAnimazione(r: { titolo: string; passi: Passo[] }, cartellaFont: string, logoSvg: string): string {
  const { larghezza: W, altezza: H } = VIDEO;
  const t = tempiAnimazione(r.passi.length);
  const x = 132; // centro dei numeri e del filo
  const cerchio = r.passi.length >= 6 ? 84 : 100;
  const [prima, chiave, dopo] = chiaveTitolo(apostrofo(r.titolo));
  const titolo = chiave ? conChiave([prima, chiave, dopo]) : conChiave(chiavePasso(apostrofo(r.titolo)));
  const righe = r.passi
    .map((p, i) => `<li style="--ritardo:${(t.primoPasso + i * t.intervallo).toFixed(2)}s"><span class="n">${p.numero}</span><span class="tp">${conChiave(chiavePasso(apostrofo(p.titolo)))}</span></li>`)
    .join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${font(cartellaFont)}
  body { background: ${COLORI.crema}; color: ${COLORI.testo}; width: ${W}px; height: ${H}px; position: relative; }
  .logo { position: absolute; left: 80px; top: 76px; width: 300px; }
  .logo svg { width: 100%; height: auto; display: block; }
  .titolo { position: absolute; left: 80px; right: 80px; top: 186px; height: 196px; display: flex; align-items: flex-end; font: 500 84px/0.95 "Degular"; letter-spacing: -0.025em; text-transform: lowercase; overflow: hidden; }
  .passi { position: absolute; left: 0; right: 80px; top: 440px; bottom: 120px; list-style: none; display: flex; flex-direction: column; justify-content: space-between; }
  .passi li { display: flex; align-items: center; gap: 44px; padding-left: ${x - cerchio / 2}px; min-height: 0; }
  .n { flex: none; width: ${cerchio}px; height: ${cerchio}px; border-radius: 999px; background: ${COLORI.crema}; border: 6px solid ${COLORI.arancione}; color: ${COLORI.arancione}; display: grid; place-items: center; font: 600 ${Math.round(cerchio * 0.54)}px/1 "Degular"; position: relative; z-index: 1; }
  .tp { font: 500 var(--fs, 64px)/0.98 "Degular"; letter-spacing: -0.02em; text-transform: lowercase; }
  .filo { position: absolute; left: ${x - 7}px; width: 14px; border-radius: 7px; background: ${COLORI.arancione}; transform-origin: top; }
  .punta { position: absolute; left: 0; top: 0; }

  .entra, .passi li { animation: entra 700ms ${EASE_OUT} both; animation-delay: var(--ritardo); }
  @keyframes entra { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
  .scena { animation: esce 600ms cubic-bezier(0.4, 0, 1, 1) both; animation-delay: ${t.uscita}s; }
  @keyframes esce { from { opacity: 1; } to { opacity: 0; } }
  </style>${ADATTA}</head><body>
  <div class="logo">${logoSvg}</div>
  <div class="scena">
    <div class="filo" id="filo"></div>
    <svg class="punta" width="${W}" height="${H}"><path id="punta" fill="none" stroke="${COLORI.arancione}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="titolo entra" style="--ritardo:${t.titolo}s" data-adatta="56"><span>${titolo}</span></div>
    <ol class="passi" id="passi">${righe}</ol>
  </div>
  <script>
    // Il filo: dal primo numero all'ultimo, cresce verso ogni passo poco prima che entri; poi la freccia aperta in fondo.
    window.prepara = () => {
      window.adatta();
      const li = [...document.querySelectorAll("#passi li")];
      // Titoli dei passi: una misura sola per tutti, la più grande con cui ognuno sta in due righe.
      // (offsetHeight e non scrollHeight: le righe ferme al primo fotogramma sono spostate in basso dall'entrata.)
      let fs = 64;
      document.body.style.setProperty("--fs", fs + "px");
      const ol = document.getElementById("passi");
      const troppo = () => li.some((l) => l.querySelector(".tp").offsetHeight > fs * 0.98 * 2 + 2) ||
        li.reduce((s, l) => s + l.offsetHeight, 0) + 22 * (li.length - 1) > ol.clientHeight;
      while (troppo() && fs > 36) { fs -= 2; document.body.style.setProperty("--fs", fs + "px"); }
      const cy = li.map((l) => { const n = l.querySelector(".n").getBoundingClientRect(); return n.top + n.height / 2; });
      const filo = document.getElementById("filo");
      const fine = cy[cy.length - 1] + 92;
      filo.style.top = cy[0] + "px";
      filo.style.height = (fine - cy[0]) + "px";
      const tot = fine - cy[0];
      const k = [{ offset: 0, transform: "scaleY(0)" }];
      const D = ${t.durata};
      cy.forEach((y, i) => {
        if (i === 0) return;
        const arrivo = ${t.primoPasso} + i * ${t.intervallo};
        k.push({ offset: Math.max(0, (arrivo - 0.55) / D), transform: "scaleY(" + ((cy[i - 1] - cy[0]) / tot) + ")", easing: "${EASE_OUT}" });
        k.push({ offset: (arrivo + 0.05) / D, transform: "scaleY(" + ((y - cy[0]) / tot) + ")" });
      });
      k.push({ offset: (${t.freccia} - 0.45) / D, transform: "scaleY(" + ((cy[cy.length - 1] - cy[0]) / tot) + ")", easing: "${EASE_OUT}" });
      k.push({ offset: ${t.freccia} / D, transform: "scaleY(1)" });
      k.push({ offset: 1, transform: "scaleY(1)" });
      filo.animate(k, { duration: D * 1000, fill: "both" });
      const punta = document.getElementById("punta");
      punta.setAttribute("d", "M ${x - 30} " + (fine - 30) + " L ${x} " + fine + " L ${x + 30} " + (fine - 30));
      punta.animate([{ opacity: 0, transform: "translateY(-24px)" }, { opacity: 1, transform: "none" }],
        { duration: 500, delay: ${t.freccia} * 1000, easing: "${EASE_OUT}", fill: "both" });
      for (const a of document.getAnimations()) a.pause();
    };
    window.vaiA = (s) => { for (const a of document.getAnimations()) a.currentTime = s * 1000; };
  </script>
  </body></html>`;
}

// Firma dei passi e versione degli indirizzi (la firma più la versione del disegno).
export const versioneGrafiche = (passi: Passo[]) => {
  const firma = firmaPassi(passi);
  return { firma, v: `${firma.slice(0, 6)}d${DESIGN_VERSIONE}` };
};

// Il modulo che legge il Worker: per ogni slug firma, versione e animazione presente.
export function moduloGrafiche(voci: Record<string, { firma: string; v: string; video: boolean }>): string {
  const righe = Object.keys(voci)
    .sort()
    .map((s) => `  ${JSON.stringify(s)}: { firma: ${JSON.stringify(voci[s].firma)}, v: ${JSON.stringify(voci[s].v)}, video: ${voci[s].video} },`);
  return `// File generato da \`npm run risorse:grafiche\` (scripts/risorse-grafiche.ts): non modificarlo a mano.
// Per ogni risorsa con le grafiche in public/risorse/<slug>/: la firma dei passi da cui sono nate,
// la versione da mettere negli indirizzi (per non ricevere da Instagram un'immagine vecchia) e se c'è l'animazione.
export type Grafiche = { firma: string; v: string; video: boolean };
export const GRAFICHE: Record<string, Grafiche> = {${righe.length ? `\n${righe.join("\n")}\n` : ""}};
`;
}

// Le voci già scritte nel modulo, per rigenerare una risorsa sola senza perdere le altre.
export function leggiModulo(testo: string): Record<string, { firma: string; v: string; video: boolean }> {
  const voci: Record<string, { firma: string; v: string; video: boolean }> = {};
  for (const m of testo.matchAll(/^\s+"([^"]+)": \{ firma: "([0-9a-f]+)", v: "([^"]+)", video: (true|false) \},$/gm)) {
    voci[m[1]] = { firma: m[2], v: m[3], video: m[4] === "true" };
  }
  return voci;
}
