ALTER TABLE `tasks` ADD `lead_id` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_lead` ON `tasks` (`lead_id`);