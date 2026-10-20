// Markdown minimo del corpo di una risorsa: titoli (## e ###), paragrafi, grassetto, elenchi numerati e puntati.
// Il risultato è solo dati (stringhe e tipi): nessun HTML viene mai interpretato, ogni carattere arriva a React
// come testo e React lo mette al sicuro. Tutto quello che non è riconosciuto resta testo così com'è.

export type Pezzo = { testo: string; grassetto: boolean };
export type Voce = { pezzi: Pezzo[]; guida: string | null; resto: Pezzo[] };
export type Blocco =
  | { tipo: "titolo"; livello: 2 | 3; pezzi: Pezzo[] }
  | { tipo: "paragrafo"; pezzi: Pezzo[] }
  | { tipo: "elenco"; ordinato: boolean; inizio: number; voci: Voce[] };

// **grassetto** su una riga sola; un ** senza compagno resta com'è.
export function pezziInline(s: string): Pezzo[] {
  const pezzi: Pezzo[] = [];
  const re = /\*\*(?=\S)(.+?)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > ultimo) pezzi.push({ testo: s.slice(ultimo, m.index), grassetto: false });
    pezzi.push({ testo: m[1], grassetto: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) pezzi.push({ testo: s.slice(ultimo), grassetto: false });
  return pezzi;
}

// Voce che apre con un grassetto ("**Registrazione dei dati.** Ordini, ..."): il grassetto diventa il titolo del passo,
// senza la punteggiatura finale, e il resto la descrizione. Senza grassetto in testa la voce resta un testo unico.
function voce(testo: string): Voce {
  const pezzi = pezziInline(testo);
  if (pezzi[0]?.grassetto) {
    const grezza = pezzi[0].testo.trim();
    const guida = grezza.replace(/[.:,;]+$/, "").trim();
    const resto = pezzi.slice(1).map((p) => ({ ...p }));
    if (resto[0]) resto[0].testo = resto[0].testo.replace(/^[\s.:,;]+/, "");
    // "**Se conferma,** l'agenda si aggiorna": staccata dal titolo, la descrizione riparte con la maiuscola.
    if (/,$/.test(grezza) && resto[0]) resto[0].testo = resto[0].testo.charAt(0).toLocaleUpperCase("it") + resto[0].testo.slice(1);
    if (guida) return { pezzi, guida, resto: resto.filter((p) => p.testo) };
  }
  return { pezzi, guida: null, resto: pezzi };
}

const TITOLO = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const NUMERATA = /^(\d{1,3})[.)]\s+(.*)$/;
const PUNTATA = /^[-*•]\s+(.*)$/;

export function analizzaCorpo(testo: string): Blocco[] {
  const blocchi: Blocco[] = [];
  let paragrafo: string[] = [];
  let elenco: { ordinato: boolean; inizio: number; voci: string[] } | null = null;
  let vuotaDopoVoce = false;

  const chiudiParagrafo = () => {
    if (paragrafo.length) blocchi.push({ tipo: "paragrafo", pezzi: pezziInline(paragrafo.join(" ")) });
    paragrafo = [];
  };
  const chiudiElenco = () => {
    if (elenco) blocchi.push({ tipo: "elenco", ordinato: elenco.ordinato, inizio: elenco.inizio, voci: elenco.voci.map(voce) });
    elenco = null;
  };

  for (const grezza of testo.replace(/\r\n?/g, "\n").split("\n")) {
    const riga = grezza.trim();
    if (!riga) {
      chiudiParagrafo();
      if (elenco) vuotaDopoVoce = true;
      continue;
    }
    const h = TITOLO.exec(riga);
    const n = NUMERATA.exec(riga);
    const p = n ? null : PUNTATA.exec(riga);
    if (h && h[2]) {
      chiudiParagrafo();
      chiudiElenco();
      blocchi.push({ tipo: "titolo", livello: h[1].length >= 3 ? 3 : 2, pezzi: pezziInline(h[2]) });
    } else if (n || p) {
      chiudiParagrafo();
      const ordinato = !!n;
      // Una riga vuota tra due voci dello stesso tipo non spezza l'elenco.
      if (elenco && elenco.ordinato !== ordinato) chiudiElenco();
      if (!elenco) elenco = { ordinato, inizio: n ? Number(n[1]) : 1, voci: [] };
      elenco.voci.push((n ? n[2] : p![1]).trim());
    } else if (elenco && !vuotaDopoVoce) {
      // Riga che continua la voce precedente, senza riga vuota in mezzo.
      elenco.voci[elenco.voci.length - 1] += ` ${riga}`;
    } else {
      chiudiElenco();
      paragrafo.push(riga);
    }
    vuotaDopoVoce = false;
  }
  chiudiParagrafo();
  chiudiElenco();
  return blocchi;
}

// Minuti di lettura a 200 parole al minuto, almeno uno.
export const minutiLettura = (testo: string) => Math.max(1, Math.round(testo.split(/\s+/).filter(Boolean).length / 200));

// La parola chiave del titolo, in arancione: la frase prima dei due punti ("Come funziona:"), altrimenti "schema",
// altrimenti la coda breve dopo l'ultima virgola ("..., e come trovare il tuo"), altrimenti nulla. Restituisce i tre pezzi del titolo (prima, chiave, dopo).
export function chiaveTitolo(titolo: string): [string, string, string] {
  const due = titolo.indexOf(":");
  if (due > 0 && due <= 40) return ["", titolo.slice(0, due + 1), titolo.slice(due + 1)];
  const m = /\bschema\b/i.exec(titolo);
  if (m) return [titolo.slice(0, m.index), m[0], titolo.slice(m.index + m[0].length)];
  const coda = /,\s+(?:e\s+)?([^,]+)$/.exec(titolo);
  if (coda && coda[1].trim().split(/\s+/).length <= 4) {
    const da = titolo.length - coda[1].length;
    return [titolo.slice(0, da), coda[1], ""];
  }
  return [titolo, "", ""];
}
