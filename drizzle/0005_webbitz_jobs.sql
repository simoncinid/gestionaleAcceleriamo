ALTER TABLE `payments` ADD `job_id` text;--> statement-breakpoint
CREATE INDEX `idx_payments_job_id` ON `payments` (`job_id`);--> statement-breakpoint
ALTER TABLE `job_templates` ADD `recurring_task_blueprint` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job_templates` ADD `recurrence_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_templates` ADD `payment_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_templates` ADD `payment_recurrence` text DEFAULT 'oneoff' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `is_recurring` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurrence_day` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `parent_job_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurrence_period` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurrence_paused` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurrence_resume_from` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `last_generated_period` text;--> statement-breakpoint
CREATE INDEX `idx_jobs_parent_period` ON `jobs` (`parent_job_id`,`recurrence_period`);--> statement-breakpoint
CREATE TABLE `job_assignments` (
	`job_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`job_id`, `member_id`)
);--> statement-breakpoint
CREATE INDEX `idx_job_assignments_job_id` ON `job_assignments` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_assignments_member_id` ON `job_assignments` (`member_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `job_assignments` (`job_id`,`member_id`)
SELECT `id`,`owner_id` FROM `jobs` WHERE `owner_id` IS NOT NULL AND `owner_id` != '';
