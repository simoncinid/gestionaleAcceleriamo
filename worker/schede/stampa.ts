import type { Fonte } from "../claude/client";
import { markdownSicuro } from "../lib/markdown";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const data = (ms: number) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }).format(ms);

// Spec 6.6: HTML con CSS di stampa e carta intestata, niente PDF nel Worker. Si stampa dal browser.
export function paginaStampa(azienda: string, md: string, fonti: Fonte[], aggiornata: number): string {
  const fontiSicure = fonti.filter((f) => /^https?:\/\//.test(f.url));
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Scheda azienda: ${esc(azienda)}</title>
<style>
@font-face { font-family: "Degular Display"; src: url("/fonts/DegularDisplay-Semibold.otf"); font-weight: 600; }
@font-face { font-family: "Inter"; src: url("/fonts/Inter-Regular.ttf"); font-weight: 400; }
@font-face { font-family: "Inter"; src: url("/fonts/Inter-SemiBold.ttf"); font-weight: 600; }
@page { size: A4; margin: 22mm 18mm 20mm; }
body { font-family: Inter, sans-serif; color: #1C1915; background: #F7F2EC; font-size: 11pt; line-height: 1.5; max-width: 760px; margin: 32px auto; padding: 0 16px; }
header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #EC5E2D; padding-bottom: 12px; margin-bottom: 24px; }
header img { height: 28px; }
h1, h2, h3, h4 { font-family: "Degular Display", Inter, sans-serif; font-weight: 600; }
h1 { font-size: 22pt; margin: 0 0 4px; }
h2 { font-size: 14pt; margin: 20px 0 6px; break-after: avoid; }
h3, h4 { font-size: 12pt; margin: 14px 0 4px; break-after: avoid; }
a { color: #1C1915; }
footer { margin-top: 32px; border-top: 1px solid #d9d0c5; padding-top: 8px; font-size: 8.5pt; color: #6b625a; }
@media print { body { background: #fff; margin: 0; max-width: none; } a { text-decoration: none; } }
</style></head>
<body>
<header><img src="/brand/logo.svg" alt="Acceleriamo"><span>Scheda azienda</span></header>
<h1>${esc(azienda)}</h1>
<p>Preparata da Claude il ${data(aggiornata)}. Sono ipotesi da fuori, da verificare in call.</p>
${markdownSicuro(md)}
${fontiSicure.length ? `<h2>Fonti</h2><ul>${fontiSicure.map((f) => `<li><a href="${esc(f.url)}" rel="noopener noreferrer">${esc(f.titolo)}</a></li>`).join("")}</ul>` : ""}
<footer>Diego Simoncini, P.IVA 02524780505, Via Capecchi 28, 56025 Pontedera (PI). Documento interno.</footer>
</body></html>`;
}
