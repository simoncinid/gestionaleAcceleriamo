import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb } from "../db/client";
import { risorse } from "../db/schema";
import { immagineRisorsa } from "../risponditore/link";

// La pagina /r/:slug è la stessa app React, ma chi incolla il link in una chat (Instagram, WhatsApp, iMessage) e i motori
// di ricerca leggono prima l'HTML: qui si aggiungono titolo, descrizione, immagine di anteprima, dati strutturati e il
// permesso di indicizzare (l'app resta noindex), più il colore crema della barra del browser.
// Il resto dell'HTML resta quello costruito da Vite (letto dagli asset), quindi l'app si carica come prima.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// Testo per l'anteprima: una riga, senza markdown, al massimo n caratteri chiusi su una parola intera.
const pulito = (s: string, n: number) => {
  const t = s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const c = t.slice(0, n - 1);
  return `${c.slice(0, Math.max(c.lastIndexOf(" "), n / 2)).replace(/[\s,;:.]+$/, "")}…`;
};

type Seo = { title?: string; description?: string; jsonld?: Record<string, unknown> | null };
const leggiSeo = (s: string | null | undefined): Seo => {
  try {
    const v = s ? JSON.parse(s) : null;
    if (!v || typeof v !== "object") return {};
    // Solo testi e oggetti: un valore di tipo sbagliato nella semina non deve far cadere la pagina.
    return {
      title: typeof v.title === "string" ? v.title : undefined,
      description: typeof v.description === "string" ? v.description : undefined,
      jsonld: v.jsonld && typeof v.jsonld === "object" && !Array.isArray(v.jsonld) ? v.jsonld : null,
    };
  } catch {
    return {};
  }
};

// I dati strutturati arrivano dal file di semina: l'immagine dell'articolo diventa la nostra anteprima, e nessun "<"
// può chiudere lo script (si scrive <, che per JSON è lo stesso carattere).
function jsonLd(jsonld: Record<string, unknown>, immagine: string): string {
  const copia = JSON.parse(JSON.stringify(jsonld)) as Record<string, unknown>;
  const nodi = Array.isArray(copia["@graph"]) ? (copia["@graph"] as Record<string, unknown>[]) : [copia];
  for (const n of nodi) if (n && typeof n === "object" && n["@type"] === "Article") n.image = immagine;
  return JSON.stringify(copia).replace(/</g, "\\u003c");
}

export function titoloPagina(d: { titolo: string; seo?: string | null }) {
  const seo = leggiSeo(d.seo);
  return seo.title?.trim() || `${pulito(d.titolo, 90)} | Acceleriamo`;
}

export function metaRisorsa(d: { base: string; slug: string; titolo: string; sottotitolo: string; corpo: string; seo?: string | null }): string {
  const seo = leggiSeo(d.seo);
  const url = `${d.base}/r/${d.slug}`;
  const titolo = pulito(d.titolo, 90);
  const descrizione = pulito(seo.description || d.sottotitolo || "Lo schema del video, passo per passo.", 170);
  const immagine = immagineRisorsa(d.base, d.slug, d.titolo, d.corpo);
  const disegnata = immagine.includes("/anteprima.png");
  const tag = [
    `<meta name="description" content="${esc(descrizione)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Acceleriamo">`,
    `<meta property="og:locale" content="it_IT">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(titolo)}">`,
    `<meta property="og:description" content="${esc(descrizione)}">`,
    `<meta property="og:image" content="${esc(immagine)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="${disegnata ? 630 : 628}">`,
    `<meta property="og:image:alt" content="${esc(titolo)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  // Senza dati strutturati nella semina, un Article essenziale con quello che la pagina già dice.
  const dati = seo.jsonld && typeof seo.jsonld === "object" ? seo.jsonld : {
    "@context": "https://schema.org", "@type": "Article", headline: titolo, description: descrizione, inLanguage: "it-IT",
    mainEntityOfPage: url, publisher: { "@type": "Organization", name: "Acceleriamo", url: "https://acceleriamo.it" },
  };
  tag.push(`<script type="application/ld+json">${jsonLd(dati, immagine)}</script>`);
  return tag.join("\n    ");
}

const base = (c: Context<AppEnv>) => (c.env.APP_URL ?? new URL(c.req.url).origin).replace(/\/$/, "");

export async function paginaRisorsa(c: Context<AppEnv>) {
  const assets = c.env.ASSETS;
  if (!assets) return c.notFound();
  // L'HTML dell'app (index.html di Vite), sempre lo stesso per ogni indirizzo.
  const html = await assets.fetch(new Request(new URL("/", c.req.url)));
  const slug = c.req.param("slug") ?? "";
  const [r] = await getDb(c.env.DB).select().from(risorse).where(eq(risorse.slug, slug)).limit(1);
  const attiva = r?.attiva ? r : null;

  const riscrittore = new HTMLRewriter()
    .on('meta[name="theme-color"]', { element: (e) => { e.setAttribute("content", "#F7F2EC"); } })
    .on("title", { element: (e) => { e.setInnerContent(attiva ? titoloPagina(attiva) : "Acceleriamo"); } });
  if (attiva) {
    const tag = metaRisorsa({ base: base(c), slug, titolo: attiva.titolo, sottotitolo: attiva.sottotitolo, corpo: attiva.corpo, seo: attiva.seo });
    riscrittore
      .on('meta[name="robots"]', { element: (e) => { e.setAttribute("content", "index, follow, max-image-preview:large"); } })
      .on("head", { element: (e) => { e.append(`    ${tag}\n  `, { html: true }); } });
  }
  const risposta = riscrittore.transform(new Response(html.body, html));
  const intestazioni = new Headers(risposta.headers);
  intestazioni.set("content-type", "text/html; charset=utf-8");
  intestazioni.delete("etag"); // l'HTML cambia da una risorsa all'altra: l'ETag di index.html non vale
  // Pochi minuti in cache: quando cambia un testo, l'anteprima nelle chat si aggiorna presto.
  intestazioni.set("cache-control", "public, max-age=300");
  return new Response(risposta.body, { status: attiva ? 200 : 404, headers: intestazioni });
}

// robots.txt: si indicizzano solo le pagine risorsa (e quello che serve a disegnarle); il gestionale resta fuori.
export function robots(c: Context<AppEnv>) {
  const testo = ["User-agent: *", "Allow: /r/", "Allow: /api/pubblico/", "Allow: /assets/", "Allow: /risorse/", "Allow: /brand/", "Allow: /fonts/", "Allow: /icone/", "Allow: /icone-3d/", "Allow: /sitemap.xml", "Allow: /app/favicon.svg", "Disallow: /", "", `Sitemap: ${base(c)}/sitemap.xml`, ""].join("\n");
  return c.text(testo, 200, { "cache-control": "public, max-age=3600" });
}

// sitemap.xml: una riga per ogni risorsa attiva.
export async function sitemap(c: Context<AppEnv>) {
  const righe = await getDb(c.env.DB).select({ slug: risorse.slug }).from(risorse).where(eq(risorse.attiva, true)).all();
  const url = righe.map((r) => `  <url><loc>${esc(`${base(c)}/r/${r.slug}`)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${url}\n</urlset>\n`;
  return c.body(xml, 200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
}
