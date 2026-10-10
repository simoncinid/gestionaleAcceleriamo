// Spec 5.2: "g" seguita da una lettera porta a un'area.
export const SCORCIATOIE: Record<string, string> = {
  "g o": "/commerciale/oggi",
  "g c": "/commerciale/scaletta",
  "g e": "/economia",
  "g a": "/automazioni",
  "g i": "/impostazioni",
};

export function leggiScorciatoia(precedente: string | null, tasto: string): { percorso?: string; attesa: string | null } {
  if (precedente === "g") {
    const percorso = SCORCIATOIE[`g ${tasto}`];
    return { percorso, attesa: null };
  }
  return { attesa: tasto === "g" ? "g" : null };
}

// Voce 65: Cmd K o Ctrl K aprono la ricerca anche da dentro un campo, ma non sopra un altro foglio aperto
// (due dialog modali impilati). "si" apre, "ignora" lascia il tasto al foglio, "no" non è la scorciatoia.
export function scorciatoiaRicerca(e: { metaKey: boolean; ctrlKey: boolean; key: string }, foglioAperto: boolean): "si" | "ignora" | "no" {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return "no";
  return foglioAperto ? "ignora" : "si";
}
