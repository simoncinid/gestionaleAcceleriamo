// L'icona 3D di ogni passo dello schema (set del brand, file in public/icone-3d/<nome>.webp).
// Si sceglie dalle parole del titolo, poi da quelle della descrizione; in mancanza, l'ingranaggio.
// Due passi di fila non hanno mai la stessa icona, e finché si può ogni icona compare una volta sola.
// Usata dalla pagina della risorsa e dall'immagine di anteprima del link (scripts/lib/risorse-grafiche.ts).

export type NomeIcona =
  | "auto" | "busta" | "caldaia" | "calendario" | "campanella" | "cartellina" | "chat" | "chiave-casa"
  | "chiave-inglese" | "clessidra" | "cono" | "dente" | "documento" | "fotocamera" | "furgone" | "ingranaggio"
  | "lente" | "monete" | "orologio" | "pacco" | "planimetria" | "quaderno" | "scontrino" | "scudo"
  | "smartphone" | "stella" | "stretta-di-mano" | "telefono" | "timbro";

// L'ordine conta: vince la prima regola che trova una parola. Le più specifiche stanno in alto.
const REGOLE: [RegExp, NomeIcona][] = [
  [/rapportin/i, "documento"],
  [/non può venire|non posso|cancell|disdic/i, "cono"],
  [/spostar/i, "orologio"],
  [/non rispond|nessuna rispost|lista d.attesa|\battesa\b|aspett/i, "clessidra"],
  [/whatsapp|messagg|\bchat\b|\bscrive|rispost|risponde/i, "chat"],
  [/\bpec\b|e-?mail|\bposta\b|casella|\binvio dell|mandar/i, "busta"],
  [/telefon|chiamat|richiam|\bchiama\b/i, "telefono"],
  [/promemoria|avvis|ricord|sollecit|notific/i, "campanella"],
  [/recension|stell[ae]\b/i, "stella"],
  [/fuori dall[ao] (regola|schema)|esce dalla regola|incert|eccezion/i, "cono"],
  [/idraulic|scaric|sifone|lavori in più|riparaz|guast/i, "chiave-inglese"],
  [/impiant|manutenz|caldai/i, "caldaia"],
  [/commercialist|fattur|scontrin|pagament|incass|\bpaga\b/i, "scontrino"],
  [/prezz|listino|forbice|\bstima\b|\bcost[oi]\b/i, "monete"],
  [/pezzo|ricambi|magazzin|merce|\bordin[ei]\b|\bpacc/i, "pacco"],
  [/\bauto\b|officina|targa|tagliando|accettazion/i, "auto"],
  [/preventiv|rapportin|document|modul|referto|report|riepilog|lettera/i, "documento"],
  [/pratica|archivi|cartell|fascicol/i, "cartellina"],
  [/\bfoto/i, "fotocamera"],
  [/\bzon[ae]\b|planimetr|mappa/i, "planimetria"],
  [/\bgiro\b|tecnic|consegn|furgon|trasport/i, "furgone"],
  [/agent[ei]\b|immobil|portal/i, "chiave-casa"],
  [/agenda|appuntament|calendari|scadenz|prenot|giorno prima|domani|mattina|mesi\b|settimane/i, "calendario"],
  [/conferm|presa in carico|pronta/i, "scudo"],
  [/dentist|\bdente|pazient|anamnesi/i, "dente"],
  [/chiudi|presa, persa|approv|firm|timbr/i, "timbro"],
  [/collega|team|collaborator|passaggi|assegn|il tuo controllo|a te\b|titolare|cliente/i, "stretta-di-mano"],
  [/elenco|registr|\blista\b|storico|\bdati\b|copiare|excel|quaderno/i, "quaderno"],
  [/\blink\b|carica|\bapp\b|smartphone/i, "smartphone"],
  [/controll|lettura|\blegge|riconosc|\bcerca|verific|\btrova/i, "lente"],
  [/tempo|giorni|\bore\b|minut|orari/i, "orologio"],
];

const RISERVE: NomeIcona[] = ["ingranaggio", "lente", "orologio"];

export const ICONE_USATE: NomeIcona[] = [...new Set([...REGOLE.map(([, n]) => n), ...RISERVE])];

const trovate = (testo: string) => REGOLE.filter(([re]) => re.test(testo)).map(([, n]) => n);

// Una icona per passo, nell'ordine dei passi.
export function iconePassi(passi: { titolo: string; descrizione: string }[]): NomeIcona[] {
  const usate = new Set<NomeIcona>();
  const scelte: NomeIcona[] = [];
  for (const p of passi) {
    const prima = scelte[scelte.length - 1];
    const candidate = [...new Set([...trovate(p.titolo), ...trovate(p.descrizione), ...RISERVE])];
    const scelta = candidate.find((n) => n !== prima && !usate.has(n)) ?? candidate.find((n) => n !== prima) ?? "ingranaggio";
    usate.add(scelta);
    scelte.push(scelta);
  }
  return scelte;
}

export const srcIcona = (n: NomeIcona) => `/icone-3d/${n}.webp`;
