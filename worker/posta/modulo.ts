// Richiesta dal modulo di acceleriamo.it (sezione "Richiedi la valutazione gratuita") arrivata come mail.
// Il formato preciso della mail non è ancora stato visto: si leggono le etichette del modulo, sia "Etichetta: valore"
// sulla stessa riga sia l'etichetta su una riga e il valore sulla riga dopo (tabelle HTML ridotte a testo).

export type RichiestaSito = {
  nome: string | null; azienda: string | null; email: string | null; telefono: string | null; ruolo: string | null;
  // Le altre risposte, nell'ordine del modulo, per le note del lead.
  risposte: { etichetta: string; valore: string }[];
};

const CAMPI: { chiave: keyof Omit<RichiestaSito, "risposte"> | null; etichetta: string; varianti: string[] }[] = [
  { chiave: "nome", etichetta: "Nome e cognome", varianti: ["nome e cognome", "nome"] },
  { chiave: "azienda", etichetta: "Azienda", varianti: ["azienda", "nome azienda"] },
  { chiave: "email", etichetta: "Email", varianti: ["email", "e-mail", "mail"] },
  { chiave: "telefono", etichetta: "Telefono", varianti: ["telefono", "cellulare", "numero di telefono"] },
  { chiave: "ruolo", etichetta: "Ruolo", varianti: ["il tuo ruolo", "ruolo"] },
  { chiave: null, etichetta: "Cosa fa perdere più tempo", varianti: ["cosa ti fa perdere più tempo?", "cosa ti fa perdere più tempo", "cosa ti fa perdere piu tempo"] },
  { chiave: null, etichetta: "In due righe", varianti: ["raccontacelo in due righe", "messaggio"] },
  { chiave: null, etichetta: "Dettagli", varianti: ["aggiungi qualche dettaglio", "dettagli"] },
  { chiave: null, etichetta: "Persone che se ne occupano", varianti: ["quante persone se ne occupano?", "quante persone se ne occupano"] },
  { chiave: null, etichetta: "Quanto spesso", varianti: ["quanto spesso lo fai?", "quanto spesso lo fai"] },
  { chiave: null, etichetta: "Programmi usati", varianti: ["che programmi usi?", "che programmi usi"] },
];

const pulisci = (s: string) => s.replace(/[*_]+/g, "").replace(/\s+/g, " ").trim();
const chiaveEtichetta = (s: string) => pulisci(s).toLowerCase().replace(/[:\s]+$/, "");

function trovaCampo(etichetta: string) {
  const k = chiaveEtichetta(etichetta);
  return CAMPI.find((c) => c.varianti.includes(k));
}

// Riconosce la mail del modulo: servono nome e telefono, più l'azienda o la domanda del modulo.
export function leggiRichiestaSito(testo: string): RichiestaSito | null {
  const linee = testo.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  const trovati = new Map<(typeof CAMPI)[number], string>();
  for (let i = 0; i < linee.length; i++) {
    const l = linee[i];
    if (!l || l.startsWith(">")) continue;
    const dueP = /^([^:]{2,45}):\s*(.*)$/.exec(l);
    if (dueP) {
      const c = trovaCampo(dueP[1]);
      if (c && !trovati.has(c)) {
        const valore = dueP[2] || (linee[i + 1] && !trovaCampo(linee[i + 1].replace(/:.*$/, "")) ? linee[++i] : "");
        trovati.set(c, pulisci(valore));
        continue;
      }
    }
    const c = trovaCampo(l);
    if (c && !trovati.has(c) && linee[i + 1] && !trovaCampo(linee[i + 1].replace(/:.*$/, ""))) trovati.set(c, pulisci(linee[++i]));
  }
  const valore = (k: string) => [...trovati].find(([c]) => c.chiave === k)?.[1] || null;
  const domanda = [...trovati.keys()].some((c) => c.etichetta === "Cosa fa perdere più tempo");
  if (!valore("nome") || !valore("telefono") || !(valore("azienda") || domanda)) return null;
  const email = valore("email");
  return {
    nome: valore("nome"),
    azienda: valore("azienda"),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    telefono: valore("telefono"),
    ruolo: valore("ruolo"),
    risposte: CAMPI.filter((c) => c.chiave === null && trovati.get(c)).map((c) => ({ etichetta: c.etichetta, valore: trovati.get(c)! })),
  };
}
