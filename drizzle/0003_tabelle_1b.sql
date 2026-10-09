CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`proposal_id` text,
	`name` text NOT NULL,
	`family` text,
	`description` text,
	`status` text DEFAULT 'in_costruzione' NOT NULL,
	`runs_on` text,
	`stack` text,
	`monthly_cost_cents` integer,
	`tech_owner_id` text,
	`pm_owner_id` text,
	`promised_at` integer,
	`activated_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`kind` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`meet_link` text,
	`notes` text,
	`outcome` text,
	`outcome_at` integer,
	`invite_sent_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_calls_scheduled` ON `calls` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `idx_calls_lead` ON `calls` (`lead_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sector` text,
	`city` text,
	`scope` text DEFAULT 'acceleriamo' NOT NULL,
	`origin_lead_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `costs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` integer NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`client_id` text,
	`automation_id` text,
	`note` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_costs_month` ON `costs` (`month`);--> statement-breakpoint
CREATE TABLE `fees` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`automation_id` text,
	`amount_cents` integer NOT NULL,
	`billing_day` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'in_attesa' NOT NULL,
	`start_at` integer,
	`paused_at` integer,
	`end_at` integer,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `hook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`status` integer NOT NULL,
	`number` text,
	`outcome` text
);
--> statement-breakpoint
CREATE INDEX `idx_hook_log_at` ON `hook_log` (`at`);--> statement-breakpoint
CREATE TABLE `integration_status` (
	`key` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	`last_ok_at` integer,
	`last_error_at` integer,
	`last_error` text,
	`error_id` text
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`fee_id` text,
	`kind` text NOT NULL,
	`number` text,
	`amount_cents` integer NOT NULL,
	`period` text,
	`issued_at` integer,
	`due_at` integer,
	`paid_at` integer,
	`pdf_url` text,
	`note` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_due` ON `invoices` (`due_at`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`key` text,
	`title` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`stage_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_templates_key_unique` ON `message_templates` (`key`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`number` text NOT NULL,
	`company` text,
	`option` text DEFAULT 'standard' NOT NULL,
	`setup_cents` integer,
	`fee_cents` integer,
	`hours_estimate` integer,
	`alternative_cents` integer,
	`valid_until` integer,
	`status` text NOT NULL,
	`sent_at` integer,
	`presented_at` integer,
	`decided_at` integer,
	`pdf_url` text,
	`source_path` text,
	`registered_via` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`objections` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_number_unique` ON `proposals` (`number`);--> statement-breakpoint
CREATE INDEX `idx_proposals_lead` ON `proposals` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_proposals_status` ON `proposals` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sheet_sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_row` integer DEFAULT 1 NOT NULL,
	`last_row_hash` text,
	`last_run_at` integer,
	`last_run` text,
	`token_cache` text
);
--> statement-breakpoint
CREATE TABLE `stage_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_key` text NOT NULL,
	`stage_id` text,
	`event` text,
	`params` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `attempt_no` integer;--> statement-breakpoint
ALTER TABLE `activities` ADD `call_id` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_activities_request` ON `activities` (`request_id`);--> statement-breakpoint
ALTER TABLE `leads` ADD `sheet_row_key` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `setup_cents` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `fee_cents` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `score` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `sequence_step` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `paused_until` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `lost_reason` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `first_response_at` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `confirmation_sent_at` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `confirmation_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `confirmation_error` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `won_start_at` integer;--> statement-breakpoint
CREATE INDEX `idx_leads_created` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_paused` ON `leads` (`paused_until`);--> statement-breakpoint
ALTER TABLE `stages` ADD `probability` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stages` ADD `suggested_next_action` text;--> statement-breakpoint
ALTER TABLE `stages` ADD `suggested_delay_hours` integer;--> statement-breakpoint
ALTER TABLE `stages` ADD `requires_reason` integer DEFAULT false NOT NULL;