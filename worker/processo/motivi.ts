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
