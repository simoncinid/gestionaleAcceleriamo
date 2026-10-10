const FORME = /\b(s\s?r\s?l\s?s?|s\s?p\s?a|s\s?n\s?c|s\s?a\s?s|s\s?s|soc\s?coop|di|e|&)\b/g;

// Chiave di confronto per i nomi d'azienda (aggancio dal wiki, abbinamenti).
export function normalizzaAzienda(nome?: string | null): string {
  return (nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:'"()&]/g, " ")
    .replace(/\s+/g, " ")
    .replace(FORME, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Un testo troppo lungo si taglia all'ultimo spazio con "...", mai a metà parola.
export function accorcia(testo: string, max: number): string {
  if (testo.length <= max) return testo;
  const taglio = testo.slice(0, max - 3);
  const spazio = taglio.search(/\s\S*$/);
  return `${(spazio > 0 ? taglio.slice(0, spazio) : taglio).trimEnd()}...`;
}
