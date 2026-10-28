// Motivi persi con codice fisso (contratto blocco 1, sezione 7): obbligatori per andare in 80.
// Le etichette si possono rinominare in Impostazioni, i codici no: Numeri li conta.
export const MOTIVI_PERSI = [
  { id: "prezzo", etichetta: "Troppo caro" },
  { id: "mai_risposto", etichetta: "Non ha mai risposto" },
  { id: "no_show", etichetta: "Non si è presentato due volte" },
  { id: "concorrente", etichetta: "Ha scelto un altro" },
  { id: "non_ora", etichetta: "Non è il momento" }, // chiede la data di ricontatto: quel giorno il lead torna in 10
  { id: "altro", etichetta: "Altro" }, // chiede il testo
] as const;
export type CodiceMotivo = (typeof MOTIVI_PERSI)[number]["id"];
export const MOTIVI_CON_DATA: CodiceMotivo[] = ["non_ora"];
export const MOTIVI_CON_TESTO: CodiceMotivo[] = ["altro"];

// Codici di prima del blocco 1: restano sui lead già chiusi e si devono ancora leggere (storico, Numeri).
const MOTIVI_VECCHI: Record<string, string> = {
  non_raggiungibile: "Non raggiungibile", non_interessato: "Non interessato", budget: "Budget", fuori_target: "Fuori target, non profilato",
  privato: "Privato", fake: "Contatti falsi o inutilizzabili", gia_servito: "Già servito",
};

export const eMotivoPerso = (id: string | null | undefined): id is CodiceMotivo => MOTIVI_PERSI.some((m) => m.id === id);

// Etichetta di un codice, nuovo o vecchio: prima quella rinominata in Impostazioni, poi quella di base.
export function etichettaMotivo(id: string, rinominati: { id: string; etichetta: string }[] = []): string {
  return rinominati.find((m) => m.id === id)?.etichetta ?? MOTIVI_PERSI.find((m) => m.id === id)?.etichetta ?? MOTIVI_VECCHI[id] ?? id;
}
