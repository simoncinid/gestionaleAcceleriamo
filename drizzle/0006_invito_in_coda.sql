ALTER TABLE `calls` ADD `invite_queued_at` integer;--> statement-breakpoint
CREATE INDEX `idx_calls_invito_in_coda` ON `calls` (`invite_queued_at`) WHERE invite_sent_at IS NULL;