export type Area = "commerciale" | "economia" | "automazioni";

// Ordine deciso da Tommaso (10/10/2026): Commerciale a sinistra, Automazioni al centro, Economia a destra.
// Vale per la barra in basso e per la barra laterale del computer, che leggono entrambe questo elenco.
export const AREE: { id: Area; etichetta: string; percorso: string }[] = [
  { id: "commerciale", etichetta: "Commerciale", percorso: "/commerciale/oggi" },
  { id: "automazioni", etichetta: "Automazioni", percorso: "/automazioni" },
  { id: "economia", etichetta: "Economia", percorso: "/economia" },
];

export const SOTTOMENU: Record<Area, { etichetta: string; percorso: string }[]> = {
  commerciale: [
    { etichetta: "Oggi", percorso: "/commerciale/oggi" },
    { etichetta: "Lead", percorso: "/commerciale/lead" },
    { etichetta: "Call", percorso: "/commerciale/call" },
    { etichetta: "Proposte", percorso: "/commerciale/proposte" },
    { etichetta: "Clienti", percorso: "/commerciale/clienti" },
    { etichetta: "Numeri", percorso: "/commerciale/numeri" },
  ],
  economia: [
    { etichetta: "Cruscotto", percorso: "/economia" },
    { etichetta: "Canoni", percorso: "/economia/canoni" },
    { etichetta: "Fatture", percorso: "/economia/fatture" },
    { etichetta: "Costi", percorso: "/economia/costi" },
  ],
  automazioni: [
    { etichetta: "Pannello", percorso: "/automazioni" },
    { etichetta: "In costruzione", percorso: "/automazioni/in-costruzione" },
    { etichetta: "Lavori", percorso: "/automazioni/lavori" },
    { etichetta: "Risponditore", percorso: "/automazioni/risponditore" },
    { etichetta: "Stato", percorso: "/automazioni/stato" },
  ],
};

export function areaDi(percorso: string): Area | null {
  const primo = percorso.split("/")[1];
  return primo === "commerciale" || primo === "economia" || primo === "automazioni" ? primo : null;
}

export type Creazione = "lead" | "esito" | "nota" | "cliente" | "proposta" | "canone" | "fattura" | "costo" | "automazione" | "task";

export const TUTTE_LE_CREAZIONI: { id: Creazione; etichetta: string }[] = [
  { id: "lead", etichetta: "Nuovo lead" },
  { id: "esito", etichetta: "Esito di una chiamata" },
  { id: "nota", etichetta: "Nota su un lead" },
  { id: "cliente", etichetta: "Nuovo cliente" },
  { id: "proposta", etichetta: "Proposta a mano" },
  { id: "canone", etichetta: "Nuovo canone" },
  { id: "fattura", etichetta: "Nuova fattura" },
  { id: "costo", etichetta: "Nuovo costo" },
  { id: "automazione", etichetta: "Nuova automazione" },
  { id: "task", etichetta: "Nuova task" },
];

// Voci del foglio aperto dal "+" della testata, nell'ordine deciso da Tommaso (10/10/2026).
export const CREAZIONI_DELL_AREA: Record<Area, Creazione[]> = {
  commerciale: ["lead", "esito", "nota", "cliente", "proposta"],
  economia: ["fattura", "canone", "costo"],
  automazioni: ["automazione", "task"],
};

// Fuori dalle tre aree (Impostazioni) il "+" offre le creazioni del Commerciale.
export function creazioniDelPercorso(percorso: string) {
  return CREAZIONI_DELL_AREA[areaDi(percorso) ?? "commerciale"].map((id) => TUTTE_LE_CREAZIONI.find((c) => c.id === id)!);
}

// Pulsante della barra laterale: la prima creazione dell'area, che apre subito il suo foglio.
export function creazioneDellaBarra(percorso: string) {
  return creazioniDelPercorso(percorso)[0];
}

// Tasto "n" sul computer: crea subito l'oggetto naturale della pagina, senza passare dal foglio.
export function creazioneDelPiu(percorso: string): Creazione {
  if (percorso.startsWith("/commerciale/proposte")) return "proposta";
  if (percorso.startsWith("/commerciale/clienti")) return "cliente";
  if (percorso.startsWith("/economia/canoni")) return "canone";
  if (percorso.startsWith("/economia/costi")) return "costo";
  if (percorso.startsWith("/economia")) return "fattura";
  if (percorso.startsWith("/automazioni/lavori")) return "task";
  if (percorso.startsWith("/automazioni")) return "automazione";
  return "lead";
}

export const REDIRECT_1A = [
  { da: "/oggi", a: "/commerciale/oggi" },
  { da: "/scaletta", a: "/commerciale/lead" },
  { da: "/lead/:id", a: "/commerciale/lead/:id" },
  { da: "/numeri", a: "/commerciale/numeri" },
  { da: "/cestino", a: "/impostazioni/dati/cestino" },
  { da: "/fasi", a: "/impostazioni/fasi" },
];
