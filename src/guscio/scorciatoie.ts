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
