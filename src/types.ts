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
  pausedUntil?: number | null; lostReason?: string | null;
  // Blocco 1: assenze alle call (fasi 30 e 50) e responsabile scelto a mano.
  noShow?: number; ownerManual?: boolean;
  // Blocco 1 bis: colonne del foglio (Inserzione, Settore, Attività) e Modulo nel CSV.
  metaAd?: string | null; metaFormId?: string | null; metaAnswers?: string | null;
  // Riga "Da fare" della funzione unica (worker/processo/processo.ts): la mostrano scheda, tabella e Oggi.
  prossima?: ProssimaAzione;
  // Pallino arancione: documenti e versioni caricati da altri e non ancora visti (spec documenti 29/10/2026).
  novita?: number;
};

export type Lead = LeadListItem & {
  website: string | null; linkedinText: string | null; metaLeadId: string | null; metaAnswers: string | null; metaAdset: string | null;
  metaAd: string | null; meetLink: string | null; proposalUrl: string | null; notes: string | null; createdBy: string | null;
  confirmationSentAt: number | null; confirmationAttempts: number; confirmationError: string | null;
};

export type Activity = { id: string; type: string; body: string; createdAt: number; authorId: string | null; authorName: string };
// Documento della scheda: link (url) o file caricato (file, versione, peso); tipo e call dicono dove sta nella scheda.
export type DocumentRow = {
  id: string; leadId: string; name: string; url: string | null; createdAt: number;
  file?: boolean; version?: number; mime?: string | null; size?: number | null; authorName?: string | null; updatedAt?: number | null;
  kind?: DocumentKind; callId?: string | null; taskId?: string | null;
};
export type VersioneDocumento = { id: string; version: number; fileName: string; size: number; createdAt: number; authorName: string | null };
import type { DocumentKind } from "../worker/db/schema";
export type LeadDetail = { lead: Lead; activities: Activity[]; documents: DocumentRow[]; duplicateOf: { id: string; company: string } | null; cliente?: { id: string; name: string; haLavori?: boolean } | null };

export type Stats = {
  bySource: { source: string; total: number; won: number; lost: number }[];
  byCampaign: { campaign: string; total: number; won: number; lost: number }[];
  byStage: { stageId: string; label: string; count: number }[];
  firstResponse: { avgMs: number | null; count: number };
};
export type { CodiceAzione, Comando, ProssimaAzione, Ruolo, StatoScadenza } from "../worker/processo/processo";
export type { Collegamenti, RigaContatto } from "../worker/leads/collegamenti-tipi";
export type { CodiceMotivo } from "../worker/processo/motivi";
import type { ProssimaAzione } from "../worker/processo/processo";
export type { CallOggi, Oggi, RigaOggi } from "../worker/today/tipi";
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
