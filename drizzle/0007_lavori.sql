CREATE TABLE `automation_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`branch` text,
	`icon` text,
	`tool` text,
	`trigger` text,
	`receives` text,
	`produces` text,
	`runs_on` text,
	`risks` text,
	`confirmed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_steps_automation` ON `automation_steps` (`automation_id`,`position`);--> statement-breakpoint
CREATE TABLE `job_template_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`recurrence` text NOT NULL,
	`assignee_id` text,
	`due_days` integer,
	`month_day` integer,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jtt_template` ON `job_template_tasks` (`template_id`,`position`);--> statement-breakpoint
CREATE TABLE `job_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`start_at` integer NOT NULL,
	`automation_id` text,
	`fee_cents` integer,
	`recurring_from_month` text,
	`status` text DEFAULT 'attivo' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_client` ON `jobs` (`client_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`client_id` text,
	`job_id` text,
	`template_task_id` text,
	`month` text,
	`assignee_id` text,
	`due_at` integer,
	`done_at` integer,
	`done_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tasks_ricorrente` ON `tasks` (`job_id`,`template_task_id`,`month`);--> statement-breakpoint
CREATE INDEX `idx_tasks_aperte` ON `tasks` (`done_at`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_client` ON `tasks` (`client_id`);--> statement-breakpoint
ALTER TABLE `clients` ADD `logo` text;