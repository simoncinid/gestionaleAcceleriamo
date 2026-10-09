CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`type` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activities_lead` ON `activities` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`changes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `call_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`status` text NOT NULL,
	`transcript` text,
	`result` text,
	`error` text,
	`confirmed_by` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`content` text,
	`sources` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`r2_key` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_documents_lead` ON `documents` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`contact_name` text,
	`email` text,
	`email_norm` text,
	`phone` text,
	`phone_norm` text,
	`website` text,
	`linkedin_text` text,
	`source` text DEFAULT 'manuale' NOT NULL,
	`meta_lead_id` text,
	`meta_form_id` text,
	`meta_campaign` text,
	`meta_adset` text,
	`meta_ad` text,
	`meta_answers` text,
	`meta_status` text,
	`meta_attempts` integer DEFAULT 0 NOT NULL,
	`stage_id` text NOT NULL,
	`stage_changed_at` integer NOT NULL,
	`estimated_value` integer,
	`owner_id` text,
	`next_action` text,
	`next_action_at` integer,
	`appointment_at` integer,
	`meet_link` text,
	`proposal_url` text,
	`notes` text,
	`duplicate_of_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_meta_lead_id_unique` ON `leads` (`meta_lead_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_stage` ON `leads` (`stage_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_email` ON `leads` (`email_norm`);--> statement-breakpoint
CREATE INDEX `idx_leads_phone` ON `leads` (`phone_norm`);--> statement-breakpoint
CREATE INDEX `idx_leads_next` ON `leads` (`next_action_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_meta_status` ON `leads` (`meta_status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL,
	`kind` text NOT NULL,
	`tone` text DEFAULT 'neutral' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);