export type Punteggio = "verde" | "giallo" | "grigio";

export type RigaOggi = {
  id: string; company: string; contactName: string | null; phone: string | null; email: string | null;
  stageId: string; stageLabel: string; nextAction: string | null; nextActionAt: number | null; stageChangedAt: number;
  ownerId: string | null; score: Punteggio | null; attemptCount: number; createdAt: number;
  setupCents: number | null; feeCents: number | null; slaScadenza: number | null;
};

export type CallOggi = { id: string; leadId: string; company: string; contactName: string | null; phone: string | null; kind: "conoscenza" | "presentazione"; scheduledAt: number; meetLink: string | null };

export type PropostaOggi = { id: string; number: string; leadId: string; company: string; contactName: string | null; email: string | null; phone: string | null; setupCents: number | null; feeCents: number | null; nextActionAt: number | null };

export type VoceAdesso = ({ tipo: "lead" } & RigaOggi) | ({ tipo: "call" } & CallOggi);

export type Oggi = {
  adesso: VoceAdesso | null;
  nuovi: RigaOggi[]; daFare: RigaOggi[]; call: CallOggi[]; proposte: PropostaOggi[]; fermi: RigaOggi[]; finePausa: RigaOggi[];
  numeri: { leadNuovi: number; primaRispostaMinuti: number | null; callSettimana: number; proposteAperte: number };
  totale: number;
};
