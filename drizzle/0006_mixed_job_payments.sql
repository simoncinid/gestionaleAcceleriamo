ALTER TABLE `job_templates` ADD `recurring_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurring_price` real DEFAULT 0 NOT NULL;
