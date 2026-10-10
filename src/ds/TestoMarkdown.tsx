import type { ReactNode } from "react";

// Spec 17: il testo di Claude si mostra come testo. Nessun HTML interpretato: solo elementi React costruiti qui
// (titoli, paragrafi, elenchi, grassetto, link http e https). Ogni altro carattere arriva a React come stringa.
function inline(s: string, chiave: string): ReactNode[] {
  const parti: ReactNode[] = [];
  // Nel link sono ammesse parentesi annidate di un livello: "(javascript:alert(1))" non lascia una ")" in giro.
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > ultimo) parti.push(s.slice(ultimo, m.index));
    const k = `${chiave}-${m.index}`;
    if (m[1]) parti.push(<strong key={k}>{m[1]}</strong>);
    else if (/^https?:\/\//.test(m[3])) parti.push(<a key={k} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline">{m[2]}</a>);
    else parti.push(m[2]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) parti.push(s.slice(ultimo));
  return parti;
}

export function TestoMarkdown({ testo }: { testo: string }) {
  const blocchi: ReactNode[] = [];
  let elenco: { k: number; t: string }[] = [];
  const chiudi = () => {
    if (elenco.length) {
      const primo = elenco[0].k;
      blocchi.push(<ul key={`u${primo}`} className="list-disc space-y-1 pl-5">{elenco.map((x) => <li key={x.k}>{inline(x.t, `l${x.k}`)}</li>)}</ul>);
    }
    elenco = [];
  };
  testo.split(/\r?\n/).forEach((riga, k) => {
    const t = riga.trim();
    const h = /^#{1,4}\s+(.*)$/.exec(t);
    const li = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(t);
    if (li) {
      elenco.push({ k, t: li[1] });
      return;
    }
    chiudi();
    if (!t) return;
    if (h) blocchi.push(<h3 key={k} className="mt-4 font-display text-riga">{inline(h[1], `h${k}`)}</h3>);
    else blocchi.push(<p key={k} className="text-corpo">{inline(t, `p${k}`)}</p>);
  });
  chiudi();
  return <div className="flex flex-col gap-2 text-corpo">{blocchi}</div>;
}
