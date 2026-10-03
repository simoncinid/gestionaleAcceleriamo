import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pipelineStages = sqliteTable("pipeline_stages", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(),
  tone: text("tone").notNull().default("neutral"),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  color: text("color").notNull(),
  email: text("email").notNull().default(""),
  role: text("role").notNull().default("commerciale"),
  permissions: text("permissions").notNull().default("{}"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  statusId: text("status_id").notNull(),
  estimatedValue: real("estimated_value").notNull().default(0),
  source: text("source").notNull().default("Manuale"),
  notes: text("notes").notNull().default(""),
  ownerId: text("owner_id"),
  appointmentAt: text("appointment_at"),
  meetingLink: text("meeting_link").notNull().default(""),
  proposalUrl: text("proposal_url").notNull().default(""),
  lastContactAt: text("last_contact_at"),
  callNotes: text("call_notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_leads_status_id").on(table.statusId)]);

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  leadId: text("lead_id"),
  ownerId: text("owner_id"),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("attivo"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  leadId: text("lead_id"),
  clientId: text("client_id"),
  name: text("name").notNull(),
  objectKey: text("object_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  kind: text("kind").notNull().default("altro"),
  externalUrl: text("external_url").notNull().default(""),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_documents_lead_id").on(table.leadId),
  index("idx_documents_client_id").on(table.clientId),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assigneeId: text("assignee_id").notNull(),
  leadId: text("lead_id"),
  clientId: text("client_id"),
  jobId: text("job_id"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("media"),
  kind: text("kind").notNull().default("oneoff"),
  recurrence: text("recurrence"),
  nextDueAt: text("next_due_at"),
  visibleFrom: text("visible_from"),
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_tasks_status_due_date").on(table.status, table.dueDate),
  index("idx_tasks_assignee_id").on(table.assigneeId),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  jobId: text("job_id"),
  seriesId: text("series_id"),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("due"),
  kind: text("kind").notNull().default("oneoff"),
  recurrence: text("recurrence"),
  dueDate: text("due_date"),
  nextIssueAt: text("next_issue_at"),
  receivedAt: text("received_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_payments_client_id").on(table.clientId),
  index("idx_payments_job_id").on(table.jobId),
  index("idx_payments_series_id").on(table.seriesId),
  index("idx_payments_status_due_date").on(table.status, table.dueDate),
]);

export const jobTemplates = sqliteTable("job_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  defaultPrice: real("default_price").notNull().default(0),
  recurringPrice: real("recurring_price").notNull().default(0),
  defaultDays: integer("default_days").notNull().default(30),
  taskBlueprint: text("task_blueprint").notNull().default("[]"),
  recurringTaskBlueprint: text("recurring_task_blueprint").notNull().default("[]"),
  recurrenceEnabled: integer("recurrence_enabled", { mode: "boolean" }).notNull().default(false),
  paymentEnabled: integer("payment_enabled", { mode: "boolean" }).notNull().default(false),
  paymentRecurrence: text("payment_recurrence").notNull().default("oneoff"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  templateId: text("template_id"),
  leadId: text("lead_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("pianificato"),
  price: real("price").notNull().default(0),
  recurringPrice: real("recurring_price").notNull().default(0),
  ownerId: text("owner_id").notNull(),
  notes: text("notes").notNull().default(""),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  recurrenceDay: integer("recurrence_day"),
  parentJobId: text("parent_job_id"),
  recurrencePeriod: text("recurrence_period"),
  recurrencePaused: integer("recurrence_paused", { mode: "boolean" }).notNull().default(false),
  recurrenceResumeFrom: text("recurrence_resume_from"),
  lastGeneratedPeriod: text("last_generated_period"),
  recurrenceStartedAt: text("recurrence_started_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_jobs_client_id").on(table.clientId),
  index("idx_jobs_status").on(table.status),
  index("idx_jobs_parent_period").on(table.parentJobId, table.recurrencePeriod),
]);

export const jobAssignments = sqliteTable("job_assignments", {
  jobId: text("job_id").notNull(),
  memberId: text("member_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.jobId, table.memberId] }),
  index("idx_job_assignments_job_id").on(table.jobId),
  index("idx_job_assignments_member_id").on(table.memberId),
]);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  actorId: text("actor_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_activities_entity").on(table.entityType, table.entityId),
]);
