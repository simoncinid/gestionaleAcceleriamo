ALTER TABLE `team_members` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `role` text DEFAULT 'commerciale' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `permissions` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `active` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `appointment_at` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `meeting_link` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `proposal_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `last_contact_at` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `call_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `status` text DEFAULT 'attivo' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `kind` text DEFAULT 'altro' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `external_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `job_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `kind` text DEFAULT 'oneoff' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `next_due_at` text;--> statement-breakpoint
ALTER TABLE `job_templates` ADD `task_blueprint` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `lead_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`actor_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_activities_entity` ON `activities` (`entity_type`,`entity_id`);
