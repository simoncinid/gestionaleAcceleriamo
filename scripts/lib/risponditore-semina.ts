// Validazione del file JSON del risponditore e costruzione dell'SQL, senza toccare il database.
// Lo usa scripts/risponditore-semina.ts. Nomi di tabelle e colonne: worker/db/schema.ts (risorse, risp_campagne).
import { normalizza } from "../../worker/risponditore/parola";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RisorsaSeme = { slug: string; titolo: string; sottotitolo: string; corpo: string; pdfUrl: string | null; attiva: boolean };
export type CampagnaSeme = {
  nome: string; parola: string; mediaId: string | null; rispostePubbliche: string[]; testoPrivato: string;
  etichettaPulsante: string; risorsaSlug: string; testoLink: string; attiva: boolean;
};
export type Semina = { risorse: RisorsaSeme[]; campagne: CampagnaSeme[]; avvisi: string[] };

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function testo(errori: string[], dove: string, v: unknown, campo: string, max: number, opz = false): string {
  if (v === undefined || v === null || v === "") {
    if (!opz) errori.push(`${dove}: manca "${campo}"`);
    return "";
  }
  if (typeof v !== "string") { errori.push(`${dove}: "${campo}" deve essere un testo`); return ""; }
  const t = v.trim();
  if (t.length > max) errori.push(`${dove}: "${campo}" supera ${max} caratteri`);
  if (!t && !opz) errori.push(`${dove}: manca "${campo}"`);
  return t;
}

/** Controlla il contenuto del JSON. Se ci sono errori li lancia tutti insieme, uno per riga. */
export function validaSemina(json: unknown): Semina {
  const errori: string[] = [];
  const avvisi: string[] = [];
  const radice = obj(json) ? json : {};
  if (!obj(json)) errori.push('Il file deve essere un oggetto con "risorse" e "campagne"');
  const listaR = radice.risorse ?? [];
  const listaC = radice.campagne ?? [];
  if (!Array.isArray(listaR)) errori.push('"risorse" deve essere un elenco');
  if (!Array.isArray(listaC)) errori.push('"campagne" deve essere un elenco');

  const risorse: RisorsaSeme[] = [];
  const visti = new Set<string>();
  (Array.isArray(listaR) ? listaR : []).forEach((r, i) => {
    const dove = `risorse[${i}]`;
    if (!obj(r)) { errori.push(`${dove}: deve essere un oggetto`); return; }
    const slug = testo(errori, dove, r.slug, "slug", 80);
    if (slug && !SLUG.test(slug)) errori.push(`${dove}: lo slug "${slug}" va in minuscolo, con i trattini tra le parole`);
    if (slug && visti.has(slug)) errori.push(`${dove}: lo slug "${slug}" compare due volte`);
    visti.add(slug);
    let pdfUrl: string | null = null;
    if (typeof r.pdfUrl === "string" && r.pdfUrl.trim()) {
      pdfUrl = r.pdfUrl.trim();
      let ok = /^https?:\/\//i.test(pdfUrl);
      try { new URL(pdfUrl); } catch { ok = false; }
      if (!ok) errori.push(`${dove}: "pdfUrl" deve essere un link http o https`);
      if (pdfUrl.length > 500) errori.push(`${dove}: "pdfUrl" supera 500 caratteri`);
    } else if (r.pdfUrl !== undefined && r.pdfUrl !== null && r.pdfUrl !== "") errori.push(`${dove}: "pdfUrl" deve essere un testo`);
    risorse.push({
      slug, titolo: testo(errori, dove, r.titolo, "titolo", 200), sottotitolo: testo(errori, dove, r.sottotitolo, "sottotitolo", 300, true),
      corpo: testo(errori, dove, r.corpo, "corpo", 20_000, true), pdfUrl, attiva: r.attiva === undefined ? true : r.attiva === true,
    });
  });

  const campagne: CampagnaSeme[] = [];
  const parole = new Set<string>();
  (Array.isArray(listaC) ? listaC : []).forEach((c, i) => {
    const dove = `campagne[${i}]`;
    if (!obj(c)) { errori.push(`${dove}: deve essere un oggetto`); return; }
    const parola = normalizza(typeof c.parola === "string" ? c.parola : "");
    if (!parola) errori.push(`${dove}: manca "parola"`);
    if (typeof c.parola === "string" && c.parola.length > 60) errori.push(`${dove}: "parola" supera 60 caratteri`);
    const mediaId = typeof c.mediaId === "string" && c.mediaId.trim() ? c.mediaId.trim() : null;
    const chiave = `${mediaId ?? ""}|${parola}`;
    if (parola && parole.has(chiave)) errori.push(`${dove}: la parola "${parola}" compare due volte${mediaId ? " per lo stesso post" : ""}`);
    parole.add(chiave);
    const risposte = Array.isArray(c.rispostePubbliche) ? c.rispostePubbliche.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
    if (!risposte.length) errori.push(`${dove}: serve almeno una risposta pubblica in "rispostePubbliche"`);
    if (risposte.length > 10 || risposte.some((x) => x.length > 300)) errori.push(`${dove}: al massimo 10 risposte pubbliche da 300 caratteri`);
    const etichetta = testo(errori, dove, c.etichettaPulsante, "etichettaPulsante", 20, true) || "Mandami il link";
    const risorsaSlug = testo(errori, dove, c.risorsaSlug, "risorsaSlug", 80);
    if (risorsaSlug && !visti.has(risorsaSlug)) avvisi.push(`${dove}: la risorsa "${risorsaSlug}" non è nel file, deve già esistere nel database`);
    campagne.push({
      nome: testo(errori, dove, c.nome, "nome", 120), parola, mediaId, rispostePubbliche: risposte,
      testoPrivato: testo(errori, dove, c.testoPrivato, "testoPrivato", 1000), etichettaPulsante: etichetta,
      risorsaSlug, testoLink: testo(errori, dove, c.testoLink, "testoLink", 1000), attiva: c.attiva === undefined ? true : c.attiva === true,
    });
  });

  if (errori.length) throw new Error(errori.join("\n"));
  return { risorse, campagne, avvisi };
}

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const b = (v: boolean) => (v ? 1 : 0);

/**
 * SQL che si può rilanciare senza duplicare: le risorse si riconoscono dallo slug, le campagne da
 * parola normalizzata e post. Ciò che esiste viene aggiornato (creata_il e id restano quelli di prima).
 */
export function sqlSemina(s: Semina, ora: number, nuovoId: () => string = () => crypto.randomUUID()): string[] {
  const righe: string[] = [];
  for (const r of s.risorse) {
    righe.push(
      `INSERT INTO risorse (slug, titolo, sottotitolo, corpo, pdf_url, attiva, creata_il) VALUES (${q(r.slug)}, ${q(r.titolo)}, ${q(r.sottotitolo)}, ${q(r.corpo)}, ${q(r.pdfUrl)}, ${b(r.attiva)}, ${ora}) ` +
      `ON CONFLICT(slug) DO UPDATE SET titolo = excluded.titolo, sottotitolo = excluded.sottotitolo, corpo = excluded.corpo, pdf_url = excluded.pdf_url, attiva = excluded.attiva;`,
    );
  }
  for (const c of s.campagne) {
    const dove = `parola = ${q(c.parola)} AND media_id IS ${q(c.mediaId)}`;
    righe.push(
      `INSERT INTO risp_campagne (id, nome, parola, media_id, rispostepubbliche, testo_privato, etichetta_pulsante, risorsa_slug, testo_link, attiva, creata_il) ` +
      `SELECT ${q(nuovoId())}, ${q(c.nome)}, ${q(c.parola)}, ${q(c.mediaId)}, ${q(JSON.stringify(c.rispostePubbliche))}, ${q(c.testoPrivato)}, ${q(c.etichettaPulsante)}, ${q(c.risorsaSlug)}, ${q(c.testoLink)}, ${b(c.attiva)}, ${ora} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM risp_campagne WHERE ${dove});`,
      `UPDATE risp_campagne SET nome = ${q(c.nome)}, rispostepubbliche = ${q(JSON.stringify(c.rispostePubbliche))}, testo_privato = ${q(c.testoPrivato)}, etichetta_pulsante = ${q(c.etichettaPulsante)}, ` +
      `risorsa_slug = ${q(c.risorsaSlug)}, testo_link = ${q(c.testoLink)}, attiva = ${b(c.attiva)} WHERE ${dove};`,
    );
  }
  return righe;
}
