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
export const DESIGN_VERSIONE = 2;

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
      const righe = Number(el.dataset.righe || 0); // facoltativo: al massimo tante righe
      const esce = () => dentro.getBoundingClientRect().height > el.clientHeight + 1 || dentro.scrollWidth > el.clientWidth + 1 ||
        (righe > 0 && dentro.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * righe + 2);
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

// Tempi dell'animazione, in secondi: apertura con il titolo (1,2 s), poi un passo alla volta a tutto schermo
// (entra in 0,45 s, resta 0,9 s, esce in 0,25 s: circa 1,35 s a vista), poi la chiusura con tutti i passi in colonna (circa 1,5 s).
// Con pochi passi la chiusura si ferma un po' di più, perché il video non scenda sotto gli 8 secondi.
export function tempiAnimazione(passi: number) {
  const apertura = 1.2;
  const ingresso = 0.45;
  const sosta = 0.9;
  const uscita = 0.25;
  const passo = ingresso + sosta + uscita;
  const chiusura = apertura + passi * passo;
  const durata = Math.max(8.1, chiusura + 1.5);
  return { apertura, ingresso, sosta, uscita, passo, chiusura, durata };
}

// L'animazione dello schema, verticale 4:5 e muta. Tre momenti:
//   apertura: il titolo della risorsa, enorme, con la parola chiave che si accende in arancione;
//   un passo per volta a tutto schermo (numero gigante, titolo grande, icona), con il filo arancione in basso che si allunga di passo in passo;
//   chiusura: tutti i passi in una colonna che riempie il riquadro, e il logo.
// Le animazioni (Web Animations) restano ferme: lo script porta ogni fotogramma al suo tempo (vaiA) e lo fotografa.
// Niente testo sotto i 40 px (la colonna finale sta tra 44 e 96 px) e il primo fotogramma è già l'apertura, non un vuoto.
export function htmlAnimazione(r: { titolo: string; passi: Passo[] }, cartellaFont: string, logoSvg: string): string {
  const { larghezza: W, altezza: H } = VIDEO;
  const n = r.passi.length;
  const t = tempiAnimazione(n);
  const x = 130; // centro dei cerchi e del filo nella colonna finale
  const cerchio = n >= 6 ? 84 : 100;
  const [prima, chiave, dopo] = chiaveTitolo(apostrofo(r.titolo));
  const titolo = chiave ? conChiave([prima, chiave, dopo]) : conChiave(chiavePasso(apostrofo(r.titolo)));
  const scene = r.passi
    .map(
      (p, i) => `<section class="scena passo" data-i="${i}">
    <div class="di">passo ${i + 1} di ${n}</div>
    <div class="ic">${iconaPasso(p, COLORI.testo, 96)}</div>
    <div class="num">${p.numero}</div>
    <div class="tp" data-adatta="84" data-righe="2"><span class="t">${conChiave(chiavePasso(apostrofo(p.titolo)))}</span></div>
  </section>`,
    )
    .join("\n  ");
  const colonna = r.passi
    .map((p) => `<li><span class="n">${p.numero}</span><span class="tc">${conChiave(chiavePasso(apostrofo(p.titolo)))}</span></li>`)
    .join("");
  const punti = r.passi.map((_, i) => `<i class="pt" style="left:${n > 1 ? (i * 100) / (n - 1) : 0}%"></i>`).join("");
  const puntiAcceso = r.passi.map((_, i) => `<i class="pa" style="left:${n > 1 ? (i * 100) / (n - 1) : 0}%"></i>`).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${font(cartellaFont)}
  body { background: ${COLORI.crema}; color: ${COLORI.testo}; width: ${W}px; height: ${H}px; position: relative; }
  .scena { position: absolute; inset: 0; }
  .logo { position: absolute; left: 80px; top: 76px; width: 320px; }
  .logo svg { width: 100%; height: auto; display: block; }
  .apertura .titolo { position: absolute; left: 64px; right: 64px; top: 250px; height: 900px; display: flex; align-items: center; font: 500 230px/0.92 "Degular"; letter-spacing: -0.03em; text-transform: lowercase; overflow: hidden; }
  .apertura .titolo span.t { display: block; text-wrap: balance; }
  .passo .di { position: absolute; left: 80px; top: 92px; font: 600 44px/1 "Inter"; color: ${COLORI.grigio}; }
  .passo .ic { position: absolute; right: 80px; top: 56px; width: 176px; height: 176px; border-radius: 999px; background: #FEFDF9; border: 3px solid ${COLORI.sabbia}; display: grid; place-items: center; }
  .passo .num { position: absolute; left: 56px; top: 90px; font: 600 800px/0.8 "Degular"; letter-spacing: -0.04em; color: ${COLORI.arancione}; }
  .passo .tp { position: absolute; left: 80px; right: 80px; top: 800px; height: 370px; display: flex; align-items: flex-end; font: 500 176px/0.94 "Degular"; letter-spacing: -0.02em; text-transform: lowercase; overflow: hidden; }
  .passo .tp span.t { display: block; }
  .trama { position: absolute; left: 100px; width: 880px; top: 1236px; height: 14px; }
  .pista, .filo { position: absolute; left: 0; top: 0; width: 100%; height: 14px; border-radius: 7px; }
  .pista { background: ${COLORI.sabbia}; }
  .filo { background: ${COLORI.arancione}; transform-origin: left; }
  .pt, .pa { position: absolute; top: -15px; width: 44px; height: 44px; margin-left: -22px; border-radius: 999px; }
  .pt { background: ${COLORI.sabbia}; }
  .pa { background: ${COLORI.arancione}; }
  .chiusura .logo { top: 70px; width: 360px; }
  .chiusura ol { position: absolute; left: 0; right: 70px; top: 220px; bottom: 80px; list-style: none; display: flex; flex-direction: column; justify-content: space-between; }
  .chiusura li { display: flex; align-items: center; gap: 36px; padding-left: ${x - cerchio / 2}px; min-height: 0; }
  .n { flex: none; width: ${cerchio}px; height: ${cerchio}px; border-radius: 999px; background: ${COLORI.crema}; border: 6px solid ${COLORI.arancione}; color: ${COLORI.arancione}; display: grid; place-items: center; font: 600 ${Math.round(cerchio * 0.54)}px/1 "Degular"; position: relative; z-index: 1; }
  .tc { font: 500 var(--fs, 96px)/0.98 "Degular"; letter-spacing: -0.02em; text-transform: lowercase; }
  .vfilo { position: absolute; left: ${x - 7}px; width: 14px; border-radius: 7px; background: ${COLORI.arancione}; transform-origin: top; }
  </style>${ADATTA}</head><body>
  <section class="scena apertura" id="apertura">
    <div class="logo">${logoSvg}</div>
    <div class="titolo" data-adatta="64" data-righe="3"><span class="t">${titolo}</span></div>
  </section>
  ${scene}
  <div class="trama" id="trama"><div class="pista"></div><div class="filo" id="filo"></div>${punti}${puntiAcceso}</div>
  <section class="scena chiusura" id="chiusura">
    <div class="logo">${logoSvg}</div>
    <div class="vfilo" id="vfilo"></div>
    <ol id="colonna">${colonna}</ol>
  </section>
  <script>
    const D = ${t.durata};
    const USCITA = ${t.uscita};
    const FORTE = "${EASE_OUT}";
    // Un elemento, una lista di punti [secondo, proprietà, curva verso il punto dopo]: la durata è quella dell'intero video.
    const anima = (el, punti) => {
      let ultimo = 0;
      const kf = punti.map(([s, p, e]) => {
        const offset = Math.min(1, Math.max(ultimo, s / D));
        ultimo = offset;
        return Object.assign({ offset }, p, e ? { easing: e } : {});
      });
      el.animate(kf, { duration: D * 1000, fill: "both" });
    };
    const NASCOSTO = (da) => Object.assign({ opacity: 0 }, da);
    const VISIBILE = { opacity: 1, transform: "none" };
    // Entrata di un pezzo: fermo e invisibile fino a s, poi arriva in dur secondi con un'uscita forte (ease-out, nessun rimbalzo).
    const entra = (el, s, dur, da, resto = []) => anima(el, [[0, NASCOSTO(da)], [s, NASCOSTO(da), FORTE], [s + dur, VISIBILE], ...resto]);
    // La scena resta nascosta fino al suo turno e, finita la sua sosta, esce in un attimo, morbida.
    const finestra = (el, s, fine) => anima(el, [
      [0, { opacity: 0 }], [s, { opacity: 0 }], [s + 0.01, { opacity: 1, transform: "none" }],
      [fine, { opacity: 1, transform: "none" }, FORTE], [fine + USCITA, { opacity: 0, transform: "translateX(-64px)" }], [D, { opacity: 0, transform: "translateX(-64px)" }],
    ]);

    window.prepara = () => {
      window.adatta();
      const scene = [...document.querySelectorAll(".passo")];
      // Colonna finale: una misura sola per tutti, la più grande (da 96 a 44 px) con cui ognuno sta in due righe e la colonna ci sta tutta.
      const li = [...document.querySelectorAll("#colonna li")];
      const ol = document.getElementById("colonna");
      let fs = 96;
      document.body.style.setProperty("--fs", fs + "px");
      const troppo = () => li.some((l) => l.querySelector(".tc").offsetHeight > fs * 0.98 * 2 + 2) ||
        li.reduce((s, l) => s + l.offsetHeight, 0) + 22 * (li.length - 1) > ol.clientHeight;
      while (troppo() && fs > 44) { fs -= 2; document.body.style.setProperty("--fs", fs + "px"); }
      const cy = li.map((l) => { const c = l.querySelector(".n").getBoundingClientRect(); return c.top + c.height / 2; });
      const vfilo = document.getElementById("vfilo");
      vfilo.style.top = cy[0] + "px";
      vfilo.style.height = (cy[cy.length - 1] - cy[0]) + "px";
      const titoloAperturaPx = parseFloat(getComputedStyle(document.querySelector(".apertura .titolo")).fontSize);

      // Apertura: il titolo c'è già dal primo fotogramma; la parola chiave si accende in arancione, poi tutto esce.
      const finApertura = ${t.apertura} - USCITA;
      anima(document.getElementById("apertura"), [[0, VISIBILE], [finApertura, VISIBILE, FORTE], [finApertura + USCITA, { opacity: 0, transform: "translateX(-64px)" }], [D, { opacity: 0, transform: "translateX(-64px)" }]]);
      document.querySelectorAll(".apertura .chiave").forEach((c) => anima(c, [[0, { color: "${COLORI.testo}" }], [0.1, { color: "${COLORI.testo}" }, FORTE], [0.65, { color: "${COLORI.arancione}" }]]));

      // Un passo per volta.
      scene.forEach((el, i) => {
        const s = ${t.apertura} + i * ${t.passo};
        finestra(el, s, s + ${t.ingresso} + ${t.sosta});
        entra(el.querySelector(".num"), s, ${t.ingresso}, { transform: "translateX(-96px)" });
        entra(el.querySelector(".tp"), s + 0.06, ${t.ingresso}, { transform: "translateY(56px)" });
        entra(el.querySelector(".ic"), s + 0.12, ${t.ingresso}, { transform: "scale(0.88)" });
        entra(el.querySelector(".di"), s + 0.08, ${t.ingresso}, { transform: "translateY(16px)" });
      });

      // Il filo in basso: nasce con il primo passo e si allunga fino al punto di ogni passo, che si accende; sparisce quando arriva la chiusura.
      const trama = document.getElementById("trama");
      const n = scene.length;
      const quota = (i) => (n > 1 ? i / (n - 1) : 1);
      anima(trama, [[0, { opacity: 0 }], [${t.apertura}, { opacity: 0 }, FORTE], [${t.apertura} + 0.3, { opacity: 1 }], [${t.chiusura} - USCITA, { opacity: 1 }], [${t.chiusura}, { opacity: 0 }], [D, { opacity: 0 }]]);
      const kf = [[0, { transform: "scaleX(0)" }]];
      scene.forEach((_, i) => {
        const s = ${t.apertura} + i * ${t.passo};
        kf.push([s + 0.05, { transform: "scaleX(" + (i ? quota(i - 1) : 0) + ")" }, FORTE]);
        kf.push([s + 0.05 + ${t.ingresso} + 0.1, { transform: "scaleX(" + quota(i) + ")" }]);
      });
      kf.push([D, { transform: "scaleX(1)" }]);
      anima(document.getElementById("filo"), kf);
      document.querySelectorAll(".pa").forEach((p, i) => {
        const s = ${t.apertura} + i * ${t.passo} + 0.2;
        entra(p, s, 0.35, { transform: "scale(0.6)" });
      });

      // Chiusura: i passi in colonna, uno dopo l'altro con un'entrata breve, e il filo che li cuce.
      const tc = ${t.chiusura};
      anima(document.getElementById("chiusura"), [[0, { opacity: 0 }], [tc, { opacity: 0 }, FORTE], [tc + 0.3, { opacity: 1 }]]);
      li.forEach((l, i) => entra(l, tc + 0.05 + i * 0.07, ${t.ingresso}, { transform: "translateY(32px)" }));
      anima(vfilo, [[0, { transform: "scaleY(0)" }], [tc + 0.1, { transform: "scaleY(0)" }, FORTE], [tc + 0.1 + 0.9, { transform: "scaleY(1)" }]]);
      for (const a of document.getAnimations()) a.pause();
      return { fsColonna: fs, fsTitolo: titoloAperturaPx };
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
