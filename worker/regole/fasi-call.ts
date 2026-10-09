// Q14: fasi che esistono solo con una call fissata. Spostare un lead qui chiede giorno e ora della call:
// la call si crea e la prossima azione diventa la call (stesso effetto di "Fissa call").
export const FASI_CON_CALL = {
  "appuntamento-confermato": "conoscenza",
  "presentazione-confermata": "presentazione",
} as const satisfies Record<string, "conoscenza" | "presentazione">;

export function callPerFase(stageId: string | null | undefined): "conoscenza" | "presentazione" | null {
  if (!stageId) return null;
  return (FASI_CON_CALL as Record<string, "conoscenza" | "presentazione">)[stageId] ?? null;
}

export const AZIONE_CALL = { conoscenza: "Call di conoscenza", presentazione: "Call di presentazione" } as const;
