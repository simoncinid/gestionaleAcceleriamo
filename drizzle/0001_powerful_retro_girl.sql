CREATE INDEX `idx_documents_lead_id` ON `documents` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_client_id` ON `documents` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_client_id` ON `jobs` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_leads_status_id` ON `leads` (`status_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_client_id` ON `payments` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_status_due_date` ON `payments` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assignee_id` ON `tasks` (`assignee_id`);