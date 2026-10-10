CREATE INDEX `idx_activities_created` ON `activities` (`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clients_origin_lead` ON `clients` (`origin_lead_id`) WHERE origin_lead_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_leads_azienda` ON `leads` (replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(company)), 'À', 'à'), 'Á', 'á'), 'È', 'è'), 'É', 'é'), 'Ì', 'ì'), 'Í', 'í'), 'Ò', 'ò'), 'Ó', 'ó'), 'Ù', 'ù'), 'Ú', 'ú'), '  ', ' '), '  ', ' '), '  ', ' ')) WHERE deleted_at IS NULL;
