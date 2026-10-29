CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_by` text,
	`via` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_document_versions` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_document_versions_created` ON `document_versions` (`created_at`);--> statement-breakpoint
CREATE TABLE `lead_visti` (
	`user_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lead_visti` ON `lead_visti` (`user_id`,`lead_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `mime` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `size` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `via` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `updated_at` integer;--> statement-breakpoint
-- 29/10/2026, documenti caricati: i link già presenti non accendono il pallino a nessuno.
INSERT OR IGNORE INTO lead_visti (user_id, lead_id, seen_at)
  SELECT u.id, d.lead_id, max(d.created_at) FROM users u CROSS JOIN documents d GROUP BY u.id, d.lead_id;
