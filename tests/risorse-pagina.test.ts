import { afterEach, describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "../worker/app";
import { metaRisorsa } from "../worker/risorse/pagina";
import { setGrafiche } from "../worker/risponditore/link";
import { firmaGrafiche, passiSchema } from "../src/pagine/pubbliche/corpoRisorsa";

const INDICE = `<!doctype html><html lang="it"><head><meta name="theme-color" content="#1C1915" /><meta name="robots" content="noindex, nofollow" /><title>Acceleriamo OS</title></head><body><div id="root"></div></body></html>`;
const ASSETS = { fetch: async () => new Response(INDICE, { headers: { "content-type": "text/html" } }) };
const ENV = { ...env, APP_URL: "https://risorse.acceleriamo.it", ASSETS };
const CORPO = "## Lo schema\n\n1. **Primo.** Uno.\n2. **Secondo.** Due.";

async function apri(path: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://test.local${path}`), ENV, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const inserisci = (slug: string, titolo: string, sottotitolo: string, attiva = 1, seo: string | null = null) =>
  env.DB.prepare("INSERT INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il, seo) VALUES (?,?,?,?,NULL,?,1,?)").bind(slug, titolo, sottotitolo, CORPO, attiva, seo).run();

afterEach(() => setGrafiche(null));

describe("pagina /r/:slug per le anteprime nelle chat", () => {
  it("risorsa attiva: titolo, descrizione, immagine e barra crema nell'HTML dell'app", async () => {
    await inserisci("guida", "Come funziona: le conferme", "Il promemoria del giorno prima.");
    setGrafiche({ guida: { firma: firmaGrafiche("Come funziona: le conferme", passiSchema(CORPO)), v: "v1" } });
    const res = await apri("/r/guida");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<title>Come funziona: le conferme | Acceleriamo</title>");
    expect(html).toContain('content="#F7F2EC"');
    expect(html).toContain('<meta property="og:title" content="Come funziona: le conferme">');
    expect(html).toContain('<meta property="og:description" content="Il promemoria del giorno prima.">');
    expect(html).toContain('<meta property="og:image" content="https://risorse.acceleriamo.it/risorse/guida/anteprima.png?v=v1">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<meta name="robots" content="index, follow, max-image-preview:large"/);
    expect(html).not.toContain("noindex");
  });

  it("dati SEO della semina: title e description di Simone, JSON-LD con la nostra anteprima e senza chiusure di script", async () => {
    const jsonld = { "@context": "https://schema.org", "@graph": [{ "@type": "Article", headline: "H", image: "https://x/passo-1.png" }, { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "a</script><b>" }] }] };
    await inserisci("seo", "Titolo lungo", "Sotto", 1, JSON.stringify({ title: "Titolo SEO | Acceleriamo", description: "Descrizione SEO.", jsonld }));
    const html = await (await apri("/r/seo")).text();
    expect(html).toContain("<title>Titolo SEO | Acceleriamo</title>");
    expect(html).toContain('<meta name="description" content="Descrizione SEO.">');
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).not.toContain("passo-1.png");
    expect(html).toContain('"image":"https://risorse.acceleriamo.it/brand/scheda-risorsa.png"');
    expect(html).not.toContain("a</script>");
    const blocco = html.split('<script type="application/ld+json">')[1].split("</script>")[0];
    expect(JSON.parse(blocco)["@graph"][1].mainEntity[0].name).toBe("a</script><b>");
  });

  it("robots.txt apre le risorse e chiude il gestionale; sitemap con le sole risorse attive", async () => {
    await inserisci("si", "Si", "");
    await inserisci("no", "No", "", 0);
    const robots = await (await apri("/robots.txt")).text();
    expect(robots).toContain("Allow: /r/");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://risorse.acceleriamo.it/sitemap.xml");
    const res = await apri("/sitemap.xml");
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<loc>https://risorse.acceleriamo.it/r/si</loc>");
    expect(xml).not.toContain("/r/no<");
  });

  it("titolo con caratteri speciali: nessun HTML entra nella pagina", async () => {
    await inserisci("strana", 'Titolo "<script>alert(1)</script>"', "a & b");
    const html = await (await apri("/r/strana")).text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('content="a &amp; b"');
  });

  it("spenta o inesistente: 404 con l'app (che mostra il suo messaggio) e senza anteprima", async () => {
    await inserisci("spenta", "Spenta", "", 0);
    for (const slug of ["spenta", "non-esiste"]) {
      const res = await apri(`/r/${slug}`);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('<div id="root"></div>');
      expect(html).not.toContain("og:title");
      expect(html).toContain("noindex");
    }
  });

  it("senza anteprima disegnata: immagine generica del brand, descrizione di riserva", () => {
    const m = metaRisorsa({ base: "https://x.it", slug: "s", titolo: "T", sottotitolo: "", corpo: CORPO });
    expect(m).toContain('content="https://x.it/brand/scheda-risorsa.png"');
    expect(m).toContain('<meta property="og:description" content="Lo schema del video, passo per passo.">');
    // Senza dati SEO: un Article essenziale con titolo, descrizione e immagine.
    const dati = JSON.parse(m.split('<script type="application/ld+json">')[1].split("</script>")[0]);
    expect(dati).toMatchObject({ "@type": "Article", headline: "T", image: "https://x.it/brand/scheda-risorsa.png", mainEntityOfPage: "https://x.it/r/s" });
  });
});
