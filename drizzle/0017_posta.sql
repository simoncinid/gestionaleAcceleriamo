CREATE TABLE `mail_lette` (
	`message_id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`tipo` text NOT NULL,
	`esito` text NOT NULL,
	`lead_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_mail_lette_at` ON `mail_lette` (`at`);--> statement-breakpoint
ALTER TABLE `calls` ADD `duration_min` integer;--> statement-breakpoint
ALTER TABLE `calls` ADD `ics_uid` text;--> statement-breakpoint
ALTER TABLE `calls` ADD `ics_sequence` integer;--> statement-breakpoint
CREATE INDEX `idx_calls_ics_uid` ON `calls` (`ics_uid`);