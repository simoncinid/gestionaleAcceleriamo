import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const LEAD_SOURCES = ["meta", "manuale", "sito", "passaparola", "altro", "migrazione", "foglio_andrea"] as const;
export const ACTIVITY_TYPES = [
  "creazione", "nota", "chiamata", "email", "cambio_fase", "meta", "documento", "cestino", "ripristino", "unione", "migrazione",
  "esito", "call", "proposta", "foglio", "ia", "email_auto", "contatto",
] as const;
export const LOST_REASONS = ["non_raggiungibile", "non_interessato", "budget", "fuori_target", "privato", "fake", "gia_servito", "altro"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: integer("locked_until"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const stages = sqliteTable("stages", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  kind: text("kind", { enum: ["open", "won", "lost"] }).notNull(),
  tone: text("tone").notNull().default("neutral"),
  probability: integer("probability").notNull().default(0),
  suggestedNextAction: text("suggested_next_action"),
  suggestedDelayHours: integer("suggested_delay_hours"),
  requiresReason: integer("requires_reason", { mode: "boolean" }).notNull().default(false),
});

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    company: text("company").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    emailNorm: text("email_norm"),
    phone: text("phone"),
    phoneNorm: text("phone_norm"),
    website: text("website"),
    linkedinText: text("linkedin_text"),
    source: text("source", { enum: LEAD_SOURCES }).notNull().default("manuale"),
    metaLeadId: text("meta_lead_id").unique(),
    metaFormId: text("meta_form_id"),
    metaCampaign: text("meta_campaign"),
    metaAdset: text("meta_adset"),
    metaAd: text("meta_ad"),
    metaAnswers: text("meta_answers"),
    metaStatus: text("meta_status", { enum: ["pending", "ok", "error"] }),
    metaAttempts: integer("meta_attempts").notNull().default(0),
    stageId: text("stage_id").notNull().references(() => stages.id),
    stageChangedAt: integer("stage_changed_at").notNull(),
    estimatedValue: integer("estimated_value"),
    ownerId: text("owner_id").references(() => users.id),
    nextAction: text("next_action"),
    nextActionAt: integer("next_action_at"),
    appointmentAt: integer("appointment_at"),
    meetLink: text("meet_link"),
    proposalUrl: text("proposal_url"),
    notes: text("notes"),
    duplicateOfId: text("duplicate_of_id"),
    sheetRowKey: text("sheet_row_key"),
    setupCents: integer("setup_cents"),
    feeCents: integer("fee_cents"),
    score: text("score", { enum: ["verde", "giallo", "grigio"] }),
    attemptCount: integer("attempt_count").notNull().default(0),
    sequenceStep: integer("sequence_step").notNull().default(0),
    pausedUntil: integer("paused_until"),
    lostReason: text("lost_reason"),
    firstResponseAt: integer("first_response_at"),
    confirmationSentAt: integer("confirmation_sent_at"),
    confirmationAttempts: integer("confirmation_attempts").notNull().default(0),
    confirmationError: text("confirmation_error"),
    wonStartAt: integer("won_start_at"),
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("idx_leads_stage").on(t.stageId),
    index("idx_leads_email").on(t.emailNorm),
    index("idx_leads_phone").on(t.phoneNorm),
    index("idx_leads_next").on(t.nextActionAt),
    index("idx_leads_appointment").on(t.appointmentAt),
    index("idx_leads_meta_status").on(t.metaStatus),
    index("idx_leads_created").on(t.createdAt),
    index("idx_leads_paused").on(t.pausedUntil),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    body: text("body").notNull().default(""),
    authorId: text("author_id"),
    createdAt: integer("created_at").notNull(),
    outcome: text("outcome"),
    attemptNo: integer("attempt_no"),
    callId: text("call_id"),
    requestId: text("request_id"),
  },
  (t) => [index("idx_activities_lead").on(t.leadId, t.createdAt), uniqueIndex("uq_activities_request").on(t.requestId)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    r2Key: text("r2_key"),
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_documents_lead").on(t.leadId)],
);

export const companyProfiles = sqliteTable("company_profiles", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status", { enum: ["queued", "running", "ready", "error"] }).notNull(),
  content: text("content"),
  sources: text("sources"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const callAnalyses = sqliteTable("call_analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  status: text("status", { enum: ["queued", "running", "ready", "error"] }).notNull(),
  transcript: text("transcript"),
  result: text("result"),
  error: text("error"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: integer("confirmed_at"),
  createdAt: integer("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  changes: text("changes"),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at").notNull(),
});

export const stageRules = sqliteTable("stage_rules", {
  id: text("id").primaryKey(),
  ruleKey: text("rule_key", { enum: ["sla", "tentativi", "preventivo_48h", "ricontatti", "pausa", "fermo"] }).notNull(),
  stageId: text("stage_id"),
  event: text("event"),
  params: text("params").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const sheetSyncState = sqliteTable("sheet_sync_state", {
  id: text("id").primaryKey(),
  lastRow: integer("last_row").notNull().default(1),
  lastRowHash: text("last_row_hash"),
  lastRunAt: integer("last_run_at"),
  lastRun: text("last_run"),
  tokenCache: text("token_cache"),
});

export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    kind: text("kind", { enum: ["conoscenza", "presentazione"] }).notNull(),
    scheduledAt: integer("scheduled_at").notNull(),
    meetLink: text("meet_link"),
    notes: text("notes"),
    outcome: text("outcome", { enum: ["fatta", "saltata", "rimandata"] }),
    outcomeAt: integer("outcome_at"),
    inviteSentAt: integer("invite_sent_at"),
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_calls_scheduled").on(t.scheduledAt), index("idx_calls_lead").on(t.leadId)],
);

export const PROPOSAL_STATUSES = ["bozza", "registrata", "presentata", "accettata", "rifiutata", "scaduta"] as const;

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id"),
    number: text("number").notNull().unique(),
    company: text("company"),
    option: text("option", { enum: ["standard", "proprieta"] }).notNull().default("standard"),
    setupCents: integer("setup_cents"),
    feeCents: integer("fee_cents"),
    hoursEstimate: integer("hours_estimate"),
    alternativeCents: integer("alternative_cents"),
    validUntil: integer("valid_until"),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull(),
    sentAt: integer("sent_at"),
    presentedAt: integer("presented_at"),
    decidedAt: integer("decided_at"),
    pdfUrl: text("pdf_url"),
    sourcePath: text("source_path"),
    registeredVia: text("registered_via", { enum: ["aggancio", "manuale", "migrazione"] }).notNull(),
    version: integer("version").notNull().default(1),
    objections: text("objections"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [index("idx_proposals_lead").on(t.leadId), index("idx_proposals_status").on(t.status)],
);

export const messageTemplates = sqliteTable("message_templates", {
  id: text("id").primaryKey(),
  channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
  key: text("key").unique(),
  title: text("title").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  stageId: text("stage_id"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const integrationStatus = sqliteTable("integration_status", {
  key: text("key").primaryKey(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  lastOkAt: integer("last_ok_at"),
  lastErrorAt: integer("last_error_at"),
  lastError: text("last_error"),
  errorId: text("error_id"),
});

// Registro delle chiamate dell'aggancio: limite di 30 l'ora e "ultime 20" in Impostazioni.
export const hookLog = sqliteTable("hook_log", {
  id: text("id").primaryKey(),
  at: integer("at").notNull(),
  status: integer("status").notNull(),
  number: text("number"),
  outcome: text("outcome"),
}, (t) => [index("idx_hook_log_at").on(t.at)]);

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  city: text("city"),
  scope: text("scope", { enum: ["acceleriamo", "fuori_perimetro"] }).notNull().default("acceleriamo"),
  originLeadId: text("origin_lead_id"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  proposalId: text("proposal_id"),
  name: text("name").notNull(),
  family: text("family"),
  description: text("description"),
  status: text("status", { enum: ["in_costruzione", "attiva", "in_pausa", "dismessa"] }).notNull().default("in_costruzione"),
  runsOn: text("runs_on"),
  stack: text("stack"),
  monthlyCostCents: integer("monthly_cost_cents"),
  techOwnerId: text("tech_owner_id"),
  pmOwnerId: text("pm_owner_id"),
  promisedAt: integer("promised_at"),
  activatedAt: integer("activated_at"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const fees = sqliteTable("fees", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  automationId: text("automation_id"),
  amountCents: integer("amount_cents").notNull(),
  billingDay: integer("billing_day").notNull().default(1),
  status: text("status", { enum: ["in_attesa", "attivo", "in_pausa", "cessato"] }).notNull().default("in_attesa"),
  startAt: integer("start_at"),
  pausedAt: integer("paused_at"),
  endAt: integer("end_at"),
  note: text("note"),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  feeId: text("fee_id"),
  kind: text("kind", { enum: ["acconto", "saldo", "canone", "extra"] }).notNull(),
  number: text("number"),
  amountCents: integer("amount_cents").notNull(),
  period: text("period"),
  issuedAt: integer("issued_at"),
  dueAt: integer("due_at"),
  paidAt: integer("paid_at"),
  pdfUrl: text("pdf_url"),
  note: text("note"),
  deletedAt: integer("deleted_at"),
}, (t) => [index("idx_invoices_due").on(t.dueAt)]);

export const costs = sqliteTable("costs", {
  id: text("id").primaryKey(),
  date: integer("date").notNull(),
  month: text("month").notNull(),
  category: text("category", { enum: ["strumenti", "costi_vivi", "altro"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  clientId: text("client_id"),
  automationId: text("automation_id"),
  note: text("note"),
  deletedAt: integer("deleted_at"),
}, (t) => [index("idx_costs_month").on(t.month)]);

export type Lead = typeof leads.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type StageRule = typeof stageRules.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type Fee = typeof fees.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Cost = typeof costs.$inferSelect;
