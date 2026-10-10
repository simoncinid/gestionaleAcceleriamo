// Solo per la versione da stampare: tutto il testo si escapa prima, poi si riconoscono poche forme
// (titoli, paragrafi, elenchi, grassetto, link http e https). Nessun HTML scritto da Claude arriva alla pagina.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Nel link sono ammesse parentesi annidate di un livello: "(javascript:alert(1))" non lascia una ")" in giro.
const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(LINK, (_m, t: string, u: string) => (/^https?:\/\//.test(u) ? `<a href="${u}" rel="noopener noreferrer">${t}</a>` : t));
}

// L'escape avviene prima del riconoscimento dei link: un URL con & diventa &amp; dentro href, che è corretto in HTML.
export function markdownSicuro(md: string): string {
  const out: string[] = [];
  let elenco: string[] = [];
  let paragrafo: string[] = [];
  const chiudiElenco = () => {
    if (elenco.length) out.push(`<ul>${elenco.map((x) => `<li>${x}</li>`).join("")}</ul>`);
    elenco = [];
  };
  const chiudiParagrafo = () => {
    if (paragrafo.length) out.push(`<p>${paragrafo.join(" ")}</p>`);
    paragrafo = [];
  };
  for (const riga of md.split(/\r?\n/)) {
    const t = riga.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    const li = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(t);
    if (!t) {
      chiudiElenco();
      chiudiParagrafo();
    } else if (h) {
      chiudiElenco();
      chiudiParagrafo();
      const n = Math.min(4, Math.max(2, h[1].length));
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
    } else if (li) {
      chiudiParagrafo();
      elenco.push(inline(li[1]));
    } else {
      chiudiElenco();
      paragrafo.push(inline(t));
    }
  }
  chiudiElenco();
  chiudiParagrafo();
  return out.join("\n");
}
