import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const LEAD_SOURCES = ["meta", "manuale", "sito", "passaparola", "altro", "migrazione"] as const;
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
    index("idx_leads_meta_status").on(t.metaStatus),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull(),
    type: text("type", {
      enum: ["creazione", "nota", "chiamata", "email", "cambio_fase", "meta", "documento", "cestino", "ripristino", "unione", "migrazione"],
    }).notNull(),
    body: text("body").notNull().default(""),
    authorId: text("author_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_activities_lead").on(t.leadId, t.createdAt)],
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

export type Lead = typeof leads.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
