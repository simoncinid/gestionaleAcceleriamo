CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`entity_id` text NOT NULL,
	`lead_id` text,
	`stato` text NOT NULL,
	`tentativi` integer DEFAULT 0 NOT NULL,
	`errore` text,
	`errore_id` text,
	`fermo_mese` text,
	`forzato` integer DEFAULT false NOT NULL,
	`richiesto_da` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_coda` ON `ai_jobs` (`stato`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_entita` ON `ai_jobs` (`tipo`,`entity_id`);--> statement-breakpoint
CREATE TABLE `campaign_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`campagna` text NOT NULL,
	`mese` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_spend` ON `campaign_spend` (`campagna`,`mese`);--> statement-breakpoint
CREATE TABLE `claude_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`tipo` text NOT NULL,
	`modello` text NOT NULL,
	`mese` text NOT NULL,
	`ingresso` integer DEFAULT 0 NOT NULL,
	`uscita` integer DEFAULT 0 NOT NULL,
	`cache_lettura` integer DEFAULT 0 NOT NULL,
	`cache_scrittura` integer DEFAULT 0 NOT NULL,
	`ricerche` integer DEFAULT 0 NOT NULL,
	`costo_micros` integer NOT NULL,
	`stimato` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_claude_usage_mese` ON `claude_usage` (`mese`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`chiave` text NOT NULL,
	`user_id` text NOT NULL,
	`evento` text NOT NULL,
	`entity_id` text NOT NULL,
	`titolo` text NOT NULL,
	`testo` text,
	`href` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`closed_at` integer,
	`push_at` integer,
	`telegram_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_chiave_unique` ON `notifications` (`chiave`);--> statement-breakpoint
CREATE INDEX `idx_notifications_aperte` ON `notifications` (`user_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_evento` ON `notifications` (`evento`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_consegna` ON `notifications` (`push_at`) WHERE closed_at IS NULL;--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`etichetta` text NOT NULL,
	`errori` integer DEFAULT 0 NOT NULL,
	`rotta` integer DEFAULT false NOT NULL,
	`last_ok_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_utente` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`settimana` text NOT NULL,
	`numeri` text NOT NULL,
	`decisioni` text DEFAULT '["","",""]' NOT NULL,
	`commento` text,
	`chiusa_da` text,
	`chiusa_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reviews_settimana_unique` ON `weekly_reviews` (`settimana`);--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `call_id` text;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `model` text;--> statement-breakpoint
ALTER TABLE `call_analyses` ADD `job_id` text;--> statement-breakpoint
CREATE INDEX `idx_call_analyses_call` ON `call_analyses` (`call_id`);--> statement-breakpoint
ALTER TABLE `company_profiles` ADD `model` text;--> statement-breakpoint
ALTER TABLE `company_profiles` ADD `job_id` text;--> statement-breakpoint
ALTER TABLE `company_profiles` ADD `classification` text;--> statement-breakpoint
CREATE INDEX `idx_company_profiles_lead` ON `company_profiles` (`lead_id`,`version`);--> statement-breakpoint
ALTER TABLE `users` ADD `telegram_chat_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `telegram_codice` text;--> statement-breakpoint
ALTER TABLE `users` ADD `telegram_codice_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_prefs` text;--> statement-breakpoint
ALTER TABLE `users` ADD `quiet_hours` text;