import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { AZIENDA_SQL } from "../lib/azienda";

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
  telegramChatId: text("telegram_chat_id"),
  // Codice di collegamento di Telegram (spec 8.4): vale 15 minuti, poi il giro smette di chiedere.
  telegramCodice: text("telegram_codice"),
  telegramCodiceAt: integer("telegram_codice_at"),
  notifyPrefs: text("notify_prefs"), // JSON { [evento]: boolean }, assente = acceso
  quietHours: text("quiet_hours"), // JSON { attive: boolean, da: "22:00", a: "07:30" }
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
    // Coda delle email di conferma da ritentare: errore registrato e non ancora partita (anche "chiave mancante", che non conta tentativi).
    index("idx_leads_conferma").on(t.confirmationAttempts).where(sql`confirmation_sent_at IS NULL AND confirmation_error IS NOT NULL`),
    // Doppione per sola azienda nell'import (worker/lib/azienda.ts): stessa espressione della query.
    index("idx_leads_azienda").on(sql.raw(AZIENDA_SQL)).where(sql`deleted_at IS NULL`),
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
  // idx_activities_created: Diario dal più recente, cursore (created_at, id).
  (t) => [index("idx_activities_lead").on(t.leadId, t.createdAt), uniqueIndex("uq_activities_request").on(t.requestId), index("idx_activities_created").on(t.createdAt, t.id)],
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
  model: text("model"),
  jobId: text("job_id"),
  classification: text("classification"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("idx_company_profiles_lead").on(t.leadId, t.version)]);

export const callAnalyses = sqliteTable("call_analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  status: text("status", { enum: ["queued", "running", "ready", "error"] }).notNull(),
  transcript: text("transcript"),
  result: text("result"),
  error: text("error"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: integer("confirmed_at"),
  callId: text("call_id"),
  model: text("model"),
  jobId: text("job_id"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_call_analyses_call").on(t.callId)]);

export const AI_TIPI = ["classificazione", "scheda", "coach", "commento"] as const;
export const AI_STATI = ["in_coda", "in_corso", "pronto", "errore", "fermo_tetto"] as const;
export type AiTipo = (typeof AI_TIPI)[number];
export type AiStato = (typeof AI_STATI)[number];

// Spec 7.4: ogni richiesta a Claude è una riga. entityId è il lead (classificazione, scheda),
// la call (coach) o la revisione del lunedì (commento).
export const aiJobs = sqliteTable("ai_jobs", {
  id: text("id").primaryKey(),
  tipo: text("tipo", { enum: AI_TIPI }).notNull(),
  entityId: text("entity_id").notNull(),
  leadId: text("lead_id"),
  stato: text("stato", { enum: AI_STATI }).notNull(),
  tentativi: integer("tentativi").notNull().default(0),
  errore: text("errore"),
  erroreId: text("errore_id"),
  // Mese di Roma ("AAAA-MM") in cui il lavoro è stato fermato dal tetto: il mese dopo riparte.
  fermoMese: text("fermo_mese"),
  forzato: integer("forzato", { mode: "boolean" }).notNull().default(false),
  richiestoDa: text("richiesto_da"),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
}, (t) => [
  index("idx_ai_jobs_coda").on(t.stato, t.createdAt),
  index("idx_ai_jobs_entita").on(t.tipo, t.entityId),
]);

// Spec 7.5: una riga per lavoro concluso o interrotto, costo in micro-dollari contati come euro.
export const claudeUsage = sqliteTable("claude_usage", {
  id: text("id").primaryKey(),
  jobId: text("job_id"),
  tipo: text("tipo", { enum: AI_TIPI }).notNull(),
  modello: text("modello").notNull(),
  mese: text("mese").notNull(),
  ingresso: integer("ingresso").notNull().default(0),
  uscita: integer("uscita").notNull().default(0),
  cacheLettura: integer("cache_lettura").notNull().default(0),
  cacheScrittura: integer("cache_scrittura").notNull().default(0),
  ricerche: integer("ricerche").notNull().default(0),
  costoMicros: integer("costo_micros").notNull(),
  stimato: integer("stimato", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_claude_usage_mese").on(t.mese)]);

// Spec 6.9: spesa mensile scritta a mano per campagna Meta (nome come arriva in leads.meta_campaign).
export const campaignSpend = sqliteTable("campaign_spend", {
  id: text("id").primaryKey(),
  campagna: text("campagna").notNull(),
  mese: text("mese").notNull(),
  amountCents: integer("amount_cents").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [uniqueIndex("uq_campaign_spend").on(t.campagna, t.mese)]);

export const EVENTI_AVVISO = [
  "lead_nuovo", "sla_90", "sla_scaduto", "proposta_oggi", "fine_pausa", "claude_tetto", "meta_48h", "integrazione_rotta",
] as const;
export type EventoAvviso = (typeof EVENTI_AVVISO)[number];

// Spec 8: un avviso per persona. chiave = evento:oggetto:persona impedisce i doppioni tra un giro e l'altro.
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  chiave: text("chiave").notNull().unique(),
  userId: text("user_id").notNull(),
  evento: text("evento", { enum: EVENTI_AVVISO }).notNull(),
  entityId: text("entity_id").notNull(),
  titolo: text("titolo").notNull(),
  testo: text("testo"),
  href: text("href"),
  createdAt: integer("created_at").notNull(),
  readAt: integer("read_at"),
  closedAt: integer("closed_at"),
  // null = da consegnare; valorizzato quando la push (o Telegram) è partita o è stata saltata per silenzio.
  pushAt: integer("push_at"),
  telegramAt: integer("telegram_at"),
}, (t) => [
  index("idx_notifications_aperte").on(t.userId, t.closedAt),
  index("idx_notifications_evento").on(t.evento, t.entityId),
  index("idx_notifications_consegna").on(t.pushAt).where(sql`closed_at IS NULL`),
  // Lettura e pulizia di Telegram a ogni giro (Task 5).
  index("idx_notifications_telegram").on(t.telegramAt),
]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  etichetta: text("etichetta").notNull(),
  errori: integer("errori").notNull().default(0),
  rotta: integer("rotta", { mode: "boolean" }).notNull().default(false),
  lastOkAt: integer("last_ok_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_push_utente").on(t.userId)]);

// Spec 6.4: numeri del lunedì calcolati alle 7:00 e salvati, decisioni e commento accanto.
export const weeklyReviews = sqliteTable("weekly_reviews", {
  id: text("id").primaryKey(),
  settimana: text("settimana").notNull().unique(), // lunedì di Roma, "AAAA-MM-GG"
  numeri: text("numeri").notNull(), // JSON NumeriSettimana (Task 11)
  decisioni: text("decisioni").notNull().default('["","",""]'),
  commento: text("commento"),
  chiusaDa: text("chiusa_da"),
  chiusaAt: integer("chiusa_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Indice su created_at (Task 12): il Registro delle modifiche va a pagine per data senza scorrere tutta la tabella.
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  changes: text("changes"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("idx_audit_log_created").on(t.createdAt)]);

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
    // Invito chiesto quando Resend non era collegato: lo manda il giro programmato appena c'è la chiave.
    inviteQueuedAt: integer("invite_queued_at"),
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("idx_calls_scheduled").on(t.scheduledAt),
    index("idx_calls_lead").on(t.leadId),
    index("idx_calls_invito_in_coda").on(t.inviteQueuedAt).where(sql`invite_sent_at IS NULL`),
  ],
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
  logo: text("logo"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
// Un lead diventa al massimo un cliente vivo (anche due chiusure insieme); un cliente nel cestino non conta.
}, (t) => [uniqueIndex("uq_clients_origin_lead").on(t.originLeadId).where(sql`origin_lead_id IS NOT NULL AND deleted_at IS NULL`)]);

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

export const JOB_KINDS = ["una_tantum", "una_tantum_ricorrente", "ricorrente"] as const;

export const jobTemplates = sqliteTable("job_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: JOB_KINDS }).notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const jobTemplateTasks = sqliteTable("job_template_tasks", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  title: text("title").notNull(),
  recurrence: text("recurrence", { enum: ["una_tantum", "ricorrente"] }).notNull(),
  assigneeId: text("assignee_id"),
  dueDays: integer("due_days"),
  monthDay: integer("month_day"),
  position: integer("position").notNull(),
}, (t) => [index("idx_jtt_template").on(t.templateId, t.position)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  templateId: text("template_id").notNull(),
  name: text("name").notNull(),
  startAt: integer("start_at").notNull(),
  automationId: text("automation_id"),
  feeCents: integer("fee_cents"),
  recurringFromMonth: text("recurring_from_month"),
  status: text("status", { enum: ["attivo", "concluso"] }).notNull().default("attivo"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (t) => [index("idx_jobs_client").on(t.clientId)]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  clientId: text("client_id"),
  jobId: text("job_id"),
  templateTaskId: text("template_task_id"),
  month: text("month"),
  assigneeId: text("assignee_id"),
  dueAt: integer("due_at"),
  doneAt: integer("done_at"),
  doneBy: text("done_by"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (t) => [
  uniqueIndex("uq_tasks_ricorrente").on(t.jobId, t.templateTaskId, t.month),
  index("idx_tasks_aperte").on(t.doneAt, t.dueAt),
  index("idx_tasks_client").on(t.clientId),
]);

export const automationSteps = sqliteTable("automation_steps", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  branch: text("branch"),
  icon: text("icon"),
  tool: text("tool"),
  trigger: text("trigger"),
  receives: text("receives"),
  produces: text("produces"),
  runsOn: text("runs_on"),
  risks: text("risks"),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
}, (t) => [index("idx_steps_automation").on(t.automationId, t.position)]);

export type JobTemplate = typeof jobTemplates.$inferSelect;
export type JobTemplateTask = typeof jobTemplateTasks.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AutomationStep = typeof automationSteps.$inferSelect;
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
