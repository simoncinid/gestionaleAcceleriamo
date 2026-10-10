export type User = { id: string; username: string; name: string };
export type Stage = {
  id: string; label: string; sortOrder: number; kind: "open" | "won" | "lost"; tone: string;
  requiresReason: boolean; probability: number; suggestedNextAction: string | null; suggestedDelayHours: number | null;
};

export type LeadListItem = {
  id: string; company: string; contactName: string | null; email: string | null; phone: string | null; source: string;
  metaCampaign: string | null; metaStatus: "pending" | "ok" | "error" | null; stageId: string; stageChangedAt: number;
  estimatedValue: number | null; ownerId: string | null; nextAction: string | null; nextActionAt: number | null;
  appointmentAt: number | null; duplicateOfId: string | null; createdAt: number; updatedAt: number; deletedAt: number | null;
  attemptCount: number; score: "verde" | "giallo" | "grigio" | null; setupCents: number | null; feeCents: number | null; sequenceStep: number;
};

export type Lead = LeadListItem & {
  website: string | null; linkedinText: string | null; metaLeadId: string | null; metaAnswers: string | null; metaAdset: string | null;
  metaAd: string | null; meetLink: string | null; proposalUrl: string | null; notes: string | null; createdBy: string | null;
  confirmationSentAt: number | null; confirmationAttempts: number; confirmationError: string | null;
};

export type Activity = { id: string; type: string; body: string; createdAt: number; authorId: string | null; authorName: string };
export type DocumentRow = { id: string; leadId: string; name: string; url: string | null; createdAt: number };
export type LeadDetail = { lead: Lead; activities: Activity[]; documents: DocumentRow[]; duplicateOf: { id: string; company: string } | null; cliente?: { id: string; name: string; haLavori?: boolean } | null };

export type Stats = {
  bySource: { source: string; total: number; won: number; lost: number }[];
  byCampaign: { campaign: string; total: number; won: number; lost: number }[];
  byStage: { stageId: string; label: string; count: number }[];
  firstResponse: { avgMs: number | null; count: number };
};
export type { CallOggi, Oggi, PropostaOggi, RigaOggi, VoceAdesso } from "../worker/today/tipi";
export type { Funnel, Stats1A, Tappa, TempoFase } from "../worker/numeri/funnel";
export type { Campagne, LivelloCosto, RigaCampagna, RigaInserzione } from "../worker/numeri/campagne";
export type { LeadAperto, Previsione, PropostaAperta, RigaFase } from "../worker/numeri/previsione";
export type { NumeriSettimana } from "../worker/lunedi/calcolo";
export type { RevisioneApi } from "../worker/lunedi/routes";
export type { VoceDiario } from "../worker/diario/routes";

export type { CallAgenda } from "../worker/calls/service";
export type { PropostaRiga } from "../worker/proposte/service";
export type { MessageTemplate, StageRule } from "../worker/db/schema";
export type { Impostazioni } from "../worker/impostazioni/default";
export type { Integrazione, StatoSistema, VoceRegistro } from "../worker/integrazioni/routes";
export type { Profilo } from "../worker/me/routes";
export type { AnteprimaImport, RiepilogoDati, RigaImport, VoceAudit } from "../worker/dati/routes";
export type { RisultatoCerca, RispostaCerca } from "../worker/ricerca/routes";
export type { GiroFoglio, RigaAnteprima } from "../worker/foglio/sync";
export type { Automation, Client, Cost, Fee, Invoice } from "../worker/db/schema";
export type { CanoneRiga, CostoRiga, Cruscotto, FatturaRiga, MeseCosti } from "../worker/economia/service";
export type { ClienteRiga, SchedaClienteDati } from "../worker/clienti/routes";
export type { AutomazioneRiga } from "../worker/automazioni/routes";
export type { TaskRiga } from "../worker/lavori/routes";
export type { AutomationStep, JobTemplate, JobTemplateTask } from "../worker/db/schema";
