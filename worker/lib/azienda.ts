// Nome d'azienda confrontabile per i doppioni (import con la sola azienda): minuscole, spazi compressi.
// In JS toLowerCase abbassa tutto; lower() di SQLite solo le lettere ASCII, quindi l'espressione SQL abbassa
// a mano le vocali accentate italiane (À È É Ì Ò Ù e le acute). Restano fuori le altre maiuscole non ASCII
// (Ñ, Ä...) e le file di più di 8 spazi: casi rari, accettati.
// La stessa espressione, carattere per carattere, sta nell'indice idx_leads_azienda (migrazione 0012):
// se cambia qui va cambiata anche là, altrimenti la query torna a scorrere la tabella.
export const aziendaNorm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const ACCENTI = ["À", "Á", "È", "É", "Ì", "Í", "Ò", "Ó", "Ù", "Ú"];
const abbassate = ACCENTI.reduce((e, c) => `replace(${e}, '${c}', '${c.toLowerCase()}')`, "lower(trim(company))");
export const AZIENDA_SQL = `replace(replace(replace(${abbassate}, '  ', ' '), '  ', ' '), '  ', ' ')`;
