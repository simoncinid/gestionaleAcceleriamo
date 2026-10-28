// Passi della corsia B per la scheda del lead: aspetta le sezioni e misura i criteri "Fatto" della sezione 10.
export default async function (page, larghezza) {
  await page.waitForSelector('[data-sezione="da-fare"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  return page.evaluate((w) => {
    const alto = window.innerHeight;
    const vista = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return "assente";
      const r = el.getBoundingClientRect();
      return r.top < alto ? (r.bottom <= alto ? "intera" : "inizia") : `sotto (${Math.round(r.top)} px)`;
    };
    const primari = [...document.querySelectorAll('main [data-variante="primario"]')];
    const p = primari[0]?.getBoundingClientRect();
    const ordine = [...document.querySelectorAll("main [data-sezione]")]
      .map((s) => ({ n: s.getAttribute("data-sezione"), y: Math.round(s.getBoundingClientRect().top), x: Math.round(s.getBoundingClientRect().left) }))
      .sort((a, b) => (w < 900 ? a.y - b.y : a.x - b.x || a.y - b.y))
      .map((s) => s.n).join(" > ");
    return JSON.stringify({
      daFare: vista('[data-sezione="da-fare"]'), contatti: vista('[data-sezione="contatti"]'), dati: vista('[data-sezione="dati"]'),
      primari: primari.length, testoPrimario: primari[0]?.textContent, primarioNellaPrimaSchermata: p ? p.bottom <= alto : null,
      fisarmoniche: document.querySelectorAll("main details").length, ordine,
    });
  }, larghezza);
}
