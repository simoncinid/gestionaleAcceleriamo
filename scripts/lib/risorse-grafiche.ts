// Pezzi puri dello script delle grafiche del risponditore (scripts/risorse-grafiche.ts): la pagina HTML dell'anteprima
// del link da fotografare con Chrome e il file dei dati per il Worker. Nessun accesso a disco o a Chrome qui: così si prova con vitest.
import { chiaveTitolo, firmaGrafiche, type Passo } from "../../src/pagine/pubbliche/corpoRisorsa";
import { iconePassi } from "../../src/pagine/pubbliche/iconePassi";

// Cambia questo numero quando cambia il disegno: cambiano gli indirizzi e Instagram non mostra le immagini vecchie.
export const DESIGN_VERSIONE = 3;

export const COLORI = { arancione: "#EC5E2D", crema: "#F7F2EC", testo: "#1C1915", sabbia: "#E3DCD2", grigio: "#6B645C" };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// In Degular l'apostrofo dritto si stacca dalle lettere: si usa quello tipografico (come nella pagina); anche le virgolette diventano tipografiche.
const apostrofo = (s: string) => s.replace(/'/g, "\u2019").replace(/"([^"]*)"/g, "\u201c$1\u201d");

const conChiave = ([prima, chiave, dopo]: [string, string, string]) =>
  `${escape(apostrofo(prima))}${chiave ? `<span class="chiave">${escape(apostrofo(chiave))}</span>` : ""}${escape(apostrofo(dopo))}`;

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

// Firma di titolo e passi (quello che si vede nell'anteprima) e versione dell'indirizzo (la firma più la versione del disegno).
export const versioneGrafiche = (titolo: string, passi: Passo[]) => {
  const firma = firmaGrafiche(titolo, passi);
  return { firma, v: `${firma.slice(0, 6)}d${DESIGN_VERSIONE}` };
};

// Il modulo che legge il Worker: per ogni slug la firma e la versione dell'anteprima.
export function moduloGrafiche(voci: Record<string, { firma: string; v: string }>): string {
  const righe = Object.keys(voci)
    .sort()
    .map((s) => `  ${JSON.stringify(s)}: { firma: ${JSON.stringify(voci[s].firma)}, v: ${JSON.stringify(voci[s].v)} },`);
  return `// File generato da \`npm run risorse:grafiche\` (scripts/risorse-grafiche.ts): non modificarlo a mano.
// Per ogni risorsa con l'anteprima in public/risorse/<slug>/anteprima.png: la firma di titolo e passi da cui è nata
// e la versione da mettere nell'indirizzo (per non ricevere da Instagram o WhatsApp un'immagine vecchia).
export type Grafiche = { firma: string; v: string };
export const GRAFICHE: Record<string, Grafiche> = {${righe.length ? `\n${righe.join("\n")}\n` : ""}};
`;
}

// Le voci già scritte nel modulo, per rigenerare una risorsa sola senza perdere le altre.
export function leggiModulo(testo: string): Record<string, { firma: string; v: string }> {
  const voci: Record<string, { firma: string; v: string }> = {};
  for (const m of testo.matchAll(/^\s+"([^"]+)": \{ firma: "([0-9a-f]+)", v: "([^"]+)"(?:, video: (?:true|false))? \},$/gm)) {
    voci[m[1]] = { firma: m[2], v: m[3] };
  }
  return voci;
}

// L'immagine di anteprima del link (1200x630): la vedono WhatsApp, iMessage e Instagram quando il link arriva in chat,
// e la scheda del messaggio. Le app la tagliano anche quadrata al centro: tutto quello che conta sta nei 630 px centrali
// (tre nodi del filo con le loro icone, il titolo, il logo); ai lati solo il filo che continua e la griglia a puntini.
// Fondo scuro come lo schema del reel e della pagina; il logo arriva in chiaro (il nero del logo diventa crema).
// cartellaIcone: la cartella con le webp del set (public/icone-3d). Leggibile a 300 px di larghezza: titolo mai sotto i 46 px.
export const ANTEPRIMA = { larghezza: 1200, altezza: 630 };
export function htmlAnteprima(r: { titolo: string; passi: Passo[] }, cartellaFont: string, logoSvg: string, cartellaIcone: string): string {
  const { larghezza: W, altezza: H } = ANTEPRIMA;
  const passi = r.passi.slice(0, 3);
  const icone = iconePassi(passi);
  const passo = 210; // distanza tra i nodi
  const x0 = W / 2 - ((passi.length - 1) * passo) / 2;
  const yFilo = 196;
  const nodi = passi
    .map((p, i) => `<div class="nodo" style="left:${x0 + i * passo}px">
      <img class="ic${i % 2 ? " pari" : ""}" src="file://${cartellaIcone}/${icone[i]}.webp" alt="">
      <span class="n">${p.numero}</span>
    </div>`)
    .join("\n    ");
  const logo = logoSvg.replace(/#1C1915/gi, COLORI.crema);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${font(cartellaFont)}
  body { background-color: ${COLORI.testo}; color: ${COLORI.crema}; position: relative; width: ${W}px; height: ${H}px;
    background-image: radial-gradient(rgb(247 242 236 / 0.09) 1.6px, transparent 2px); background-size: 30px 30px; background-position: 15px 15px; }
  .filo { position: absolute; left: 0; right: 0; top: ${yFilo - 3}px; height: 6px; border-radius: 3px;
    background: linear-gradient(90deg, rgb(236 94 45 / 0) 0%, ${COLORI.arancione} 24%, ${COLORI.arancione} 76%, rgb(236 94 45 / 0) 100%); }
  .nodo { position: absolute; top: ${yFilo}px; width: 0; height: 0; }
  .n { position: absolute; left: -38px; top: -38px; width: 76px; height: 76px; border-radius: 999px; background: ${COLORI.arancione};
    color: ${COLORI.testo}; display: grid; place-items: center; font: 600 46px/1 "Degular"; box-shadow: 0 0 0 10px ${COLORI.testo}; }
  .ic { position: absolute; left: -6px; top: -150px; width: 112px; height: 112px; transform: rotate(7deg); filter: drop-shadow(0 10px 12px rgb(0 0 0 / 0.35)); }
  .ic.pari { transform: rotate(-6deg); }
  .titolo { position: absolute; left: ${(W - 600) / 2}px; width: 600px; top: 266px; height: 246px; display: flex; align-items: center; justify-content: center;
    text-align: center; font: 500 76px/0.96 "Degular"; letter-spacing: -0.02em; text-transform: lowercase; text-wrap: balance; overflow: hidden; }
  .titolo .t { display: block; }
  .logo { position: absolute; left: ${(W - 250) / 2}px; top: 540px; width: 250px; }
  .logo svg { width: 100%; height: auto; display: block; }
  </style>${ADATTA}</head><body>
  <div class="filo"></div>
  ${nodi}
  <div class="titolo" data-adatta="46"><span class="t">${conChiave(chiaveTitolo(apostrofo(r.titolo)))}</span></div>
  <div class="logo">${logo}</div>
  </body></html>`;
}
