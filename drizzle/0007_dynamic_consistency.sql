ALTER TABLE `payments` ADD `series_id` text;--> statement-breakpoint
CREATE INDEX `idx_payments_series_id` ON `payments` (`series_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `recurrence_started_at` text;
