ALTER TABLE `leads` ADD `no_show` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `owner_manual` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Blocco 1, modifica 2: prima chiamata entro 30 minuti in orario di lavoro (Vincenzo, contratto sezione 2).
UPDATE stage_rules SET params = '{"minuti":30,"avvisoMinuti":20}' WHERE id = 'sla-prima';
