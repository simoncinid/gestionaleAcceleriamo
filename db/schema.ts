import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pipelineStages = sqliteTable("pipeline_stages", {
  id: text("id").primaryKey(), label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull(), tone: text("tone").notNull().default("neutral"),
});
export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(), name: text("name").notNull(), initials: text("initials").notNull(), color: text("color").notNull(),
});
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(), company: text("company").notNull(), contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), statusId: text("status_id").notNull(),
  estimatedValue: real("estimated_value").notNull().default(0), source: text("source").notNull().default("Manuale"), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_leads_status_id").on(table.statusId)]);
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(), company: text("company").notNull(), contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), leadId: text("lead_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), leadId: text("lead_id"), clientId: text("client_id"), name: text("name").notNull(), objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(), size: integer("size").notNull(), uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_documents_lead_id").on(table.leadId), index("idx_documents_client_id").on(table.clientId)]);
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), title: text("title").notNull(), description: text("description").notNull().default(""), assigneeId: text("assignee_id").notNull(),
  leadId: text("lead_id"), clientId: text("client_id"), status: text("status").notNull().default("todo"), priority: text("priority").notNull().default("media"),
  dueDate: text("due_date"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_tasks_status_due_date").on(table.status, table.dueDate), index("idx_tasks_assignee_id").on(table.assigneeId)]);
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), description: text("description").notNull(), amount: real("amount").notNull(),
  status: text("status").notNull().default("due"), kind: text("kind").notNull().default("oneoff"), recurrence: text("recurrence"), dueDate: text("due_date"),
  nextIssueAt: text("next_issue_at"), receivedAt: text("received_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_payments_client_id").on(table.clientId), index("idx_payments_status_due_date").on(table.status, table.dueDate)]);
export const jobTemplates = sqliteTable("job_templates", {
  id: text("id").primaryKey(), title: text("title").notNull(), description: text("description").notNull().default(""), defaultPrice: real("default_price").notNull().default(0),
  defaultDays: integer("default_days").notNull().default(30), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull(), templateId: text("template_id"), title: text("title").notNull(),
  status: text("status").notNull().default("pianificato"), price: real("price").notNull().default(0), ownerId: text("owner_id").notNull(),
  startDate: text("start_date"), dueDate: text("due_date"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_jobs_client_id").on(table.clientId), index("idx_jobs_status").on(table.status)]);
